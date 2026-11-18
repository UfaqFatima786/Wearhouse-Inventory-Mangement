import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Bell, Boxes, ChartNoAxesCombined,
  Check, ChevronDown, CircleAlert, ClipboardList, Download, FileText, LayoutDashboard,
  LogOut, Menu, Package, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Truck,
  UserRound, Users, Warehouse as WarehouseIcon, X
} from 'lucide-react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler } from 'chart.js';
import { api, uploadImage } from './api.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

const roleNames = {
  admin: 'Administrator',
  warehouseManager: 'Warehouse manager',
  supplier: 'Supplier',
  salesRepresentative: 'Sales representative'
};
const currency = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'inventory', label: 'Inventory', icon: Boxes, roles: ['admin', 'warehouseManager', 'salesRepresentative'] },
  { id: 'warehouses', label: 'Warehouses', icon: WarehouseIcon, roles: ['admin', 'warehouseManager', 'salesRepresentative'] },
  { id: 'orders', label: 'Sales orders', icon: ClipboardList, roles: ['admin', 'warehouseManager', 'salesRepresentative'] },
  { id: 'transactions', label: 'Stock movement', icon: ArrowLeftRight, roles: ['admin', 'warehouseManager'] },
  { id: 'supplies', label: 'Supply requests', icon: Truck, roles: ['admin', 'warehouseManager', 'supplier'] },
  { id: 'users', label: 'Team & suppliers', icon: Users, roles: ['admin'] },
  { id: 'activity', label: 'Activity log', icon: Activity, roles: ['admin'] },
  { id: 'profile', label: 'My profile', icon: UserRound, roles: ['supplier'] }
];

function messageOf(error) {
  return error?.message || 'Something went wrong.';
}

function stockTotal(rows) {
  return rows.reduce((total, row) => total + (row.quantity || 0), 0);
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

function Status({ value }) {
  const tone = String(value || '').toLowerCase().replaceAll(' ', '-');
  return <span className={`status status-${tone}`}>{value}</span>;
}

function Notice({ notice, dismiss }) {
  if (!notice) return null;
  return (
    <div className={`toast ${notice.type === 'error' ? 'toast-error' : ''}`}>
      {notice.type === 'error' ? <CircleAlert size={18} /> : <Check size={18} />}
      <span>{notice.text}</span>
      <button className="icon-button" onClick={dismiss} aria-label="Dismiss"><X size={15} /></button>
    </div>
  );
}

function Metric({ label, value, note, icon: Icon, tone }) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}><Icon size={19} /></div>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </article>
  );
}

function Modal({ title, onClose, children, wide = false }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`}>
        <div className="modal-head"><div><span className="eyebrow">WORKSPACE</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose}><X size={19} /></button></div>
        {children}
      </section>
    </div>
  );
}

function Scanner({ onScan, onClose }) {
  const scannerId = useRef(`scanner-${Math.random().toString(36).slice(2)}`);
  const [error, setError] = useState('');
  useEffect(() => {
    let scanner;
    let cancelled = false;
    import('html5-qrcode').then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
      if (cancelled) return;
      scanner = new Html5Qrcode(scannerId.current, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E
        ]
      });
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decoded) => {
          onScan(decoded);
          scanner.stop().catch(() => {});
          onClose();
        },
        () => {}
      ).catch((reason) => setError(`Camera could not start: ${reason}`));
    }).catch((reason) => setError(`Barcode scanner could not load: ${reason}`));
    return () => {
      cancelled = true;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [onClose, onScan]);
  return <Modal title="Scan a barcode" onClose={onClose}><div id={scannerId.current} className="scanner-frame" />{error && <div className="notice error">{error}</div>}<p className="form-hint">Allow camera access, or type the barcode/SKU in the product search.</p></Modal>;
}

async function downloadInvoice(order) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('STOCKROOM', 18, 24);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(95, 106, 126);
  doc.text('SALES INVOICE', 18, 32);
  doc.text(`Invoice ${order.orderNumber}`, 18, 48);
  doc.text(`Date ${formatDate(order.updatedAt || order.createdAt)}`, 18, 55);
  doc.text(`Customer ${order.customerName}`, 18, 62);
  doc.text(`Warehouse ${order.warehouse?.name || '—'}`, 18, 69);
  doc.setDrawColor(225, 229, 236);
  doc.line(18, 77, 192, 77);
  let y = 88;
  doc.setFont('helvetica', 'bold');
  doc.text('ITEM', 18, y);
  doc.text('QTY', 135, y);
  doc.text('UNIT PRICE', 153, y);
  y += 8;
  doc.setFont('helvetica', 'normal');
  for (const line of order.products || []) {
    const name = line.product?.name || line.name || 'Product';
    doc.text(doc.splitTextToSize(name, 100), 18, y);
    doc.text(String(line.quantity), 135, y);
    doc.text(currency.format(line.price).replace('PKR', 'Rs.'), 153, y);
    y += 9;
  }
  doc.line(18, y + 1, 192, y + 1);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Total  ${currency.format(order.totalAmount).replace('PKR', 'Rs.')}`, 130, y + 12);
  doc.save(`${order.orderNumber}-invoice.pdf`);
}

export default function Dashboard({ user, onUserChange, onLogout }) {
  const [section, setSection] = useState('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [modal, setModal] = useState('');
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ category: '', supplier: '', warehouse: '', availability: '' });
  const [scannerOpen, setScannerOpen] = useState(false);
  const [data, setData] = useState({
    dashboard: { stats: {}, charts: { sales: [], stockMovement: [], topProducts: [] }, lowStockItems: [], activity: [] },
    products: [], stock: [], lowStock: [], warehouses: [], orders: [], users: [], transactions: [], requests: [], activity: []
  });
  const allowedNav = navItems.filter((item) => !item.roles || item.roles.includes(user.role));
  const activeNav = allowedNav.find((item) => item.id === section) || allowedNav[0];
  const notify = useCallback((text, type = 'success') => {
    setNotice({ text, type });
    window.setTimeout(() => setNotice(null), 5200);
  }, []);

  const refresh = useCallback(async () => {
    const jobs = [
      ['dashboard', '/analytics/dashboard'],
      ['products', '/products'],
      ['warehouses', '/warehouses']
    ];
    if (['admin', 'warehouseManager', 'salesRepresentative'].includes(user.role)) {
      jobs.push(['stock', '/stock'], ['lowStock', '/stock/low'], ['orders', '/orders']);
    }
    if (['admin', 'warehouseManager'].includes(user.role)) {
      jobs.push(['transactions', '/transactions']);
    }
    if (['admin', 'warehouseManager', 'supplier'].includes(user.role)) {
      jobs.push(['requests', '/supply-requests']);
    }
    if (user.role === 'admin') jobs.push(['users', '/users'], ['activity', '/users/activity']);
    const results = await Promise.all(jobs.map(async ([key, path]) => [key, await api(path)]));
    setData((current) => {
      const next = { ...current };
      for (const [key, result] of results) {
        const collection = key === 'dashboard' ? result : result[key] || [];
        if (key === 'dashboard') next.dashboard = collection;
        else next[key] = collection;
      }
      return next;
    });
  }, [user.role]);

  useEffect(() => {
    refresh().catch((error) => notify(messageOf(error), 'error'));
  }, [refresh, notify]);

  const categories = useMemo(() => [...new Set(data.products.map((item) => item.category).filter(Boolean))].sort(), [data.products]);
  const suppliers = useMemo(() => data.users.filter((item) => item.role === 'supplier'), [data.users]);
  const visibleProducts = useMemo(() => data.products.filter((product) => {
    const search = query.trim().toLowerCase();
    return (!search || `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(search)) &&
      (!filters.category || product.category === filters.category) &&
      (!filters.supplier || String(product.supplier?._id || product.supplier) === filters.supplier) &&
      (!filters.warehouse || product.warehouseStock?.some((row) => String(row.warehouse?._id || row.warehouse) === filters.warehouse)) &&
      (!filters.availability || (
        filters.availability === 'inStock' ? product.available > 0 :
          filters.availability === 'outOfStock' ? product.available === 0 :
            filters.availability === 'low' ? product.available <= product.lowStockLimit : true
      ));
  }), [data.products, filters, query]);

  async function submitAction(action, successMessage) {
    setBusy(true);
    try {
      const result = await action();
      setModal('');
      setEditing(null);
      await refresh();
      if (result?.warning) notify(result.warning, 'error');
      else notify(successMessage);
      return true;
    } catch (error) {
      notify(messageOf(error), 'error');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeOrderStatus(order, status) {
    await submitAction(
      () => api(`/orders/${order._id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
      `Order moved to ${status.toLowerCase()}.`
    );
  }

  async function cancelOrder(order) {
    if (!window.confirm(`Cancel order ${order.orderNumber}?`)) return;
    await submitAction(
      () => api(`/orders/${order._id}/cancel`, { method: 'PUT', body: JSON.stringify({}) }),
      'Order cancelled.'
    );
  }

  async function deleteRecord(type, item) {
    const name = item.name || item.orderNumber || 'this record';
    if (!window.confirm(`Delete ${name}? This action cannot be undone.`)) return;
    const paths = { product: `/products/${item._id}`, user: `/users/${item._id}`, warehouse: `/warehouses/${item._id}` };
    await submitAction(() => api(paths[type], { method: 'DELETE' }), `${name} deleted.`);
  }

  function changeSection(next) {
    setSection(next);
    setQuery('');
    setFilters({ category: '', supplier: '', warehouse: '', availability: '' });
    setCollapsed(false);
  }

  const selectedLabel = activeNav?.label || 'Overview';
  return (
    <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-mark"><Boxes size={21} /></div>
          {!collapsed && <div className="brand-copy"><strong>stockroom</strong><span>OPERATIONS</span></div>}
          <button className="icon-button sidebar-toggle" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar"><Menu size={18} /></button>
        </div>
        <div className="workspace-label">{!collapsed && <><span className="workspace-dot" /> MAIN WORKSPACE</>}</div>
        <nav className="side-nav">
          {allowedNav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-link ${section === id ? 'selected' : ''}`} onClick={() => changeSection(id)} title={collapsed ? label : undefined}>
              <Icon size={18} /><span>{label}</span>
              {id === 'supplies' && data.requests.filter((item) => item.status === 'Pending').length > 0 && <span className="nav-count">{data.requests.filter((item) => item.status === 'Pending').length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {!collapsed && <div className="help-card"><div className="help-icon"><ShieldCheck size={17} /></div><strong>Stock, under control.</strong><p>Keep your team and inventory moving together.</p></div>}
          <div className="profile-menu">
            <div className="avatar">{user.image ? <img src={user.image} alt="" /> : user.name?.slice(0, 1).toUpperCase()}</div>
            {!collapsed && <div className="profile-label"><strong>{user.name}</strong><span>{roleNames[user.role]}</span></div>}
            <button className="icon-button logout-button" onClick={onLogout} aria-label="Sign out"><LogOut size={17} /></button>
          </div>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>{selectedLabel}</strong></div>
          <div className="topbar-actions"><div className="date-chip">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div><button className="icon-button notification-button" aria-label="Notifications" onClick={() => changeSection(user.role === 'supplier' ? 'supplies' : 'inventory')}><Bell size={18} />{data.lowStock.length > 0 && <i />}</button><div className="avatar small">{user.image ? <img src={user.image} alt="" /> : user.name?.slice(0, 1).toUpperCase()}</div></div>
        </header>
        <div className="page-content">
          <Notice notice={notice} dismiss={() => setNotice(null)} />
          {section === 'overview' && <Overview user={user} data={data} onNavigate={changeSection} />}
          {section === 'products' && <ProductsPage products={visibleProducts} allProducts={data.products} query={query} setQuery={setQuery} filters={filters} setFilters={setFilters} categories={categories} suppliers={suppliers} warehouses={data.warehouses} user={user} onCreate={() => { setEditing(null); setModal('product'); }} onEdit={(item) => { setEditing(item); setModal('product'); }} onDelete={(item) => deleteRecord('product', item)} onScan={() => setScannerOpen(true)} />}
          {section === 'inventory' && <InventoryPage data={data} user={user} onCreate={(type) => { setEditing(null); setModal(type); }} />}
          {section === 'warehouses' && <WarehousesPage data={data} user={user} onCreate={() => { setEditing(null); setModal('warehouse'); }} onEdit={(item) => { setEditing(item); setModal('warehouse'); }} onDelete={(item) => deleteRecord('warehouse', item)} />}
          {section === 'orders' && <OrdersPage orders={data.orders} user={user} onCreate={() => setModal('order')} onStatus={changeOrderStatus} onCancel={cancelOrder} />}
          {section === 'transactions' && <TransactionsPage transactions={data.transactions} />}
          {section === 'supplies' && <SuppliesPage requests={data.requests} user={user} products={data.products} warehouses={data.warehouses} onCreate={() => setModal('supply')} onReview={async (request, status) => {
            await submitAction(() => api(`/supply-requests/${request._id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }), `Supply request ${status.toLowerCase()}.`);
          }} />}
          {section === 'users' && <UsersPage users={data.users} onCreate={() => { setEditing(null); setModal('user'); }} onEdit={(item) => { setEditing(item); setModal('user'); }} onDelete={(item) => deleteRecord('user', item)} />}
          {section === 'activity' && <ActivityPage activity={data.activity} />}
          {section === 'profile' && <ProfilePage user={user} onSave={async (values) => {
            const succeeded = await submitAction(async () => {
              const profile = { ...values };
              if (values.file) Object.assign(profile, await uploadImage(values.file));
              delete profile.file;
              const result = await api(`/users/${user._id}`, { method: 'PUT', body: JSON.stringify(profile) });
              localStorage.setItem('warehouse-user', JSON.stringify(result.user));
              onUserChange(result.user);
            }, 'Profile updated.');
            if (!succeeded) throw new Error('Profile could not be saved.');
          }} />}
        </div>
      </main>

      {modal === 'product' && <ProductForm initial={editing} products={data.products} suppliers={suppliers} busy={busy} onClose={() => setModal('')} onSubmit={(values) => submitAction(async () => {
        const payload = { ...values };
        if (values.file) Object.assign(payload, await uploadImage(values.file));
        delete payload.file;
        await api(editing ? `/products/${editing._id}` : '/products', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      }, editing ? 'Product updated.' : 'Product added.')} />}
      {modal === 'user' && <UserForm initial={editing} warehouses={data.warehouses} busy={busy} onClose={() => setModal('')} onSubmit={(values) => submitAction(async () => {
        const payload = { ...values, assignedWarehouses: values.assignedWarehouses || [] };
        if (values.file) Object.assign(payload, await uploadImage(values.file));
        delete payload.file;
        await api(editing ? `/users/${editing._id}` : '/users', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      }, editing ? 'Account updated.' : 'Account created.')} />}
      {modal === 'warehouse' && <WarehouseForm initial={editing} users={data.users} busy={busy} onClose={() => setModal('')} onSubmit={(values) => submitAction(() => api(editing ? `/warehouses/${editing._id}` : '/warehouses', { method: editing ? 'PUT' : 'POST', body: JSON.stringify(values) }), editing ? 'Warehouse updated.' : 'Warehouse created.')} />}
      {modal === 'stock-in' && <StockForm title="Receive stock" products={data.products} warehouses={data.warehouses} user={user} busy={busy} onClose={() => setModal('')} onSubmit={(values) => submitAction(() => api('/stock/in', { method: 'POST', body: JSON.stringify(values) }), 'Stock received.')} />}
      {modal === 'stock-out' && <StockForm title="Remove stock" products={data.products} warehouses={data.warehouses} user={user} busy={busy} onClose={() => setModal('')} onSubmit={(values) => submitAction(() => api('/stock/out', { method: 'POST', body: JSON.stringify(values) }), 'Stock removed.')} />}
      {modal === 'transfer' && <TransferForm products={data.products} warehouses={data.warehouses} user={user} busy={busy} onClose={() => setModal('')} onSubmit={(values) => submitAction(() => api('/stock/transfer', { method: 'POST', body: JSON.stringify(values) }), 'Stock transferred.')} />}
      {modal === 'order' && <OrderForm products={data.products} warehouses={data.warehouses} busy={busy} onClose={() => setModal('')} onSubmit={(values) => submitAction(() => api('/orders', { method: 'POST', body: JSON.stringify(values) }), 'Sales order created.')} />}
      {modal === 'supply' && <SupplyForm products={data.products} warehouses={data.warehouses} busy={busy} onClose={() => setModal('')} onSubmit={(values) => submitAction(() => api('/supply-requests', { method: 'POST', body: JSON.stringify(values) }), 'Supply request submitted.')} />}
      {scannerOpen && <Scanner onScan={setQuery} onClose={() => setScannerOpen(false)} />}
    </div>
  );
}

function PageTitle({ eyebrow = 'WORKSPACE', title, description, actions }) {
  return <div className="page-title"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="title-actions">{actions}</div>}</div>;
}

function Overview({ user, data, onNavigate }) {
  const { stats = {}, charts = {}, lowStockItems = [], activity = [] } = data.dashboard || {};
  const labels = monthNames;
  const salesMap = new Map((charts.sales || []).map((item) => [item._id, item]));
  const sales = labels.map((_, index) => salesMap.get(index + 1)?.revenue || 0);
  const movementMap = new Map();
  for (const row of charts.stockMovement || []) {
    const current = movementMap.get(row._id.month) || { in: 0, out: 0 };
    current[row._id.type.includes('in') ? 'in' : 'out'] += row.quantity;
    movementMap.set(row._id.month, current);
  }
  const movementIn = labels.map((_, index) => movementMap.get(index + 1)?.in || 0);
  const movementOut = labels.map((_, index) => movementMap.get(index + 1)?.out || 0);
  const top = charts.topProducts || [];
  const admin = user.role === 'admin';
  const salesRep = user.role === 'salesRepresentative';
  const metricItems = admin
    ? [
      ['Products', stats.products || 0, 'Active product records', Package, 'blue'],
      ['Warehouses', stats.warehouses || 0, 'Connected locations', WarehouseIcon, 'purple'],
      ['Sales orders', stats.orders || 0, `${stats.pendingOrders || 0} pending action`, ClipboardList, 'green'],
      ['Low stock', stats.lowStock || 0, 'Items need attention', CircleAlert, 'orange']
    ]
    : salesRep
      ? [
        ['Products', stats.products || 0, 'Available to order', Package, 'blue'],
        ['Warehouses', stats.warehouses || 0, 'Order fulfilment points', WarehouseIcon, 'purple'],
        ['My orders', stats.orders || 0, `${stats.pendingOrders || 0} awaiting processing`, ClipboardList, 'green'],
        ['Low stock', stats.lowStock || 0, 'Items to check', CircleAlert, 'orange']
      ]
      : user.role === 'supplier'
        ? [
          ['My products', stats.products || 0, 'Associated products', Package, 'blue'],
          ['Open requests', stats.supplyRequests || 0, 'Awaiting review', Truck, 'purple'],
          ['Warehouses', stats.warehouses || 0, 'Available locations', WarehouseIcon, 'green'],
          ['Low stock', stats.lowStock || 0, 'Items need attention', CircleAlert, 'orange']
        ]
        : [
          ['Products', stats.products || 0, 'Managed in assigned locations', Package, 'blue'],
          ['Warehouses', stats.warehouses || 0, 'Assigned to you', WarehouseIcon, 'purple'],
          ['Stock movements', stats.transactions || 0, 'Recorded transactions', ArrowLeftRight, 'green'],
          ['Low stock', stats.lowStock || 0, 'Items need attention', CircleAlert, 'orange']
        ];
  return (
    <>
      <PageTitle eyebrow="OVERVIEW" title={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, ${user.name?.split(' ')[0]}.`} description="Here’s what’s happening across your inventory today." actions={<button className="button secondary" onClick={() => onNavigate('inventory')}><SlidersHorizontal size={16} /> View inventory</button>} />
      <div className="metric-grid">{metricItems.map(([label, value, note, icon, tone]) => <Metric key={label} {...{ label, value, note, icon, tone }} />)}</div>
      <div className="analytics-grid">
        <section className="surface chart-card"><div className="panel-heading"><div><span className="eyebrow">REVENUE</span><h2>Sales performance</h2></div><span className="chart-caption">This year · PKR</span></div><div className="chart-wrap"><Line data={{ labels, datasets: [{ label: 'Completed sales', data: sales, borderColor: '#579b83', backgroundColor: 'rgba(87,155,131,.11)', fill: true, tension: .38, pointRadius: 2, pointHoverRadius: 5 }] }} options={chartOptions(currency.format)} /></div></section>
        <section className="surface chart-card"><div className="panel-heading"><div><span className="eyebrow">MOVEMENT</span><h2>Stock in & out</h2></div><span className="chart-caption">Units · YTD</span></div><div className="chart-wrap"><Bar data={{ labels, datasets: [{ label: 'Stock in', data: movementIn, backgroundColor: '#8bb8a3', borderRadius: 4 }, { label: 'Stock out', data: movementOut, backgroundColor: '#e8b47d', borderRadius: 4 }] }} options={chartOptions()} /></div></section>
      </div>
      <div className="lower-grid">
        <section className="surface panel"><div className="panel-heading"><div><span className="eyebrow">ATTENTION</span><h2>Low-stock products</h2></div><button className="text-button" onClick={() => onNavigate('inventory')}>See inventory <span>→</span></button></div>
          {lowStockItems.length ? <div className="compact-list">{lowStockItems.slice(0, 5).map((row) => <div className="compact-row" key={`${row.product?._id}-${row.warehouse}`}><div className="product-avatar">{row.product?.imageUrl ? <img src={row.product.imageUrl} alt="" /> : <Package size={17} />}</div><div className="compact-main"><strong>{row.product?.name || 'Product'}</strong><span>{row.warehouse?.name || 'Warehouse'} · SKU {row.product?.sku}</span></div><span className="stock-warning">{row.quantity} left</span></div>)}</div> : <EmptyState icon={Check} title="Stock levels look healthy" text="No products are currently below their reorder limit." />}
        </section>
        <section className="surface panel"><div className="panel-heading"><div><span className="eyebrow">BEST SELLERS</span><h2>Top-selling products</h2></div><ChartNoAxesCombined size={18} className="muted-icon" /></div>
          {top.length ? <div className="top-product-chart"><Doughnut data={{ labels: top.map((item) => item.name), datasets: [{ data: top.map((item) => item.units), backgroundColor: ['#579b83', '#7895cb', '#e8b47d', '#a88bc9', '#77b9b2'], borderWidth: 0, hoverOffset: 4 }] }} options={{ responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, padding: 14, color: '#687286', font: { family: 'Inter', size: 10 } } } } }} /></div> : <EmptyState icon={Package} title="No completed sales yet" text="Your best-selling products will show up here." />}
        </section>
      </div>
      {admin && <section className="surface panel activity-preview"><div className="panel-heading"><div><span className="eyebrow">TEAM ACTIVITY</span><h2>Recent changes</h2></div><button className="text-button" onClick={() => onNavigate('activity')}>View activity <span>→</span></button></div><ActivityRows activity={activity.slice(0, 5)} /></section>}
    </>
  );
}

function chartOptions(tickFormat) {
  return {
    responsive: true, maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, padding: 16, color: '#687286', font: { family: 'Inter', size: 10 } } },
      tooltip: { callbacks: tickFormat ? { label: (context) => `${context.dataset.label}: ${tickFormat(context.raw)}` } : {} }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#9299a7', font: { family: 'Inter', size: 10 }, maxTicksLimit: 8 } },
      y: { beginAtZero: true, grid: { color: '#eff1f4' }, ticks: { color: '#9299a7', font: { family: 'Inter', size: 10 }, callback: tickFormat ? (value) => `${Math.round(value / 1000)}k` : undefined } }
    }
  };
}

function ProductsPage({ products, allProducts, query, setQuery, filters, setFilters, categories, suppliers, warehouses, user, onCreate, onEdit, onDelete, onScan }) {
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  return (
    <>
      <PageTitle eyebrow="CATALOGUE" title="Products" description={`${allProducts.length} product${allProducts.length === 1 ? '' : 's'} across your catalogue.`} actions={<>{['admin', 'warehouseManager', 'salesRepresentative'].includes(user.role) && <button className="button secondary" onClick={onScan}><Settings2 size={16} /> Scan barcode</button>}{['admin', 'warehouseManager'].includes(user.role) && <button className="button primary" onClick={onCreate}><Plus size={17} /> Add product</button>}</>} />
      <section className="surface table-surface">
        <div className="filter-toolbar">
          <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, SKU or scan barcode…" /><kbd>SKU</kbd></label>
          <div className="filter-selects">
            <select aria-label="Filter by category" value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select>
            {suppliers.length > 0 && <select aria-label="Filter by supplier" value={filters.supplier} onChange={(event) => updateFilter('supplier', event.target.value)}><option value="">All suppliers</option>{suppliers.map((supplier) => <option value={supplier._id} key={supplier._id}>{supplier.name}</option>)}</select>}
            <select aria-label="Filter by warehouse" value={filters.warehouse} onChange={(event) => updateFilter('warehouse', event.target.value)}><option value="">All warehouses</option>{warehouses.map((warehouse) => <option value={warehouse._id} key={warehouse._id}>{warehouse.name}</option>)}</select>
            <select aria-label="Filter by availability" value={filters.availability} onChange={(event) => updateFilter('availability', event.target.value)}><option value="">Any availability</option><option value="inStock">In stock</option><option value="low">Low stock</option><option value="outOfStock">Out of stock</option></select>
          </div>
        </div>
        <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>SKU / CATEGORY</th><th>SUPPLIER</th><th>PRICE</th><th>AVAILABILITY</th><th>STATUS</th>{['admin', 'warehouseManager'].includes(user.role) && <th />}</tr></thead><tbody>
          {products.map((product) => <tr key={product._id}><td><div className="table-product"><div className="product-avatar">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : <Package size={17} />}</div><div><strong>{product.name}</strong><span>{product.description || '—'}</span></div></div></td><td><strong className="mono">{product.sku}</strong><span className="cell-sub">{product.category}</span></td><td>{product.supplier?.name || '—'}</td><td>{currency.format(product.price)}</td><td><strong>{product.available || 0}</strong><span className="cell-sub">Low at {product.lowStockLimit}</span></td><td><Status value={product.available <= product.lowStockLimit ? 'Low stock' : 'In stock'} /></td>{['admin', 'warehouseManager'].includes(user.role) && <td><div className="row-actions"><button className="text-button" onClick={() => onEdit(product)}>Edit</button>{user.role === 'admin' && <button className="text-button danger-text" onClick={() => onDelete(product)}>Delete</button>}</div></td>}</tr>)}
          {!products.length && <tr><td colSpan="7"><EmptyState icon={Search} title="No matching products" text="Try changing your search or filters." /></td></tr>}
        </tbody></table></div>
        <div className="table-footer"><span>Showing <strong>{products.length}</strong> of {allProducts.length} products</span><span><SlidersHorizontal size={14} /> Filters update instantly</span></div>
      </section>
    </>
  );
}

function InventoryPage({ data, user, onCreate }) {
  const manager = user.role === 'warehouseManager' || user.role === 'admin';
  return (
    <>
      <PageTitle eyebrow="STOCK CONTROL" title="Inventory" description="A warehouse-by-warehouse view of available stock and reorder levels." actions={manager && <><button className="button secondary" onClick={() => onCreate('transfer')}><ArrowLeftRight size={16} /> Transfer stock</button><button className="button secondary" onClick={() => onCreate('stock-out')}><ArrowUpFromLine size={16} /> Stock out</button><button className="button primary" onClick={() => onCreate('stock-in')}><ArrowDownToLine size={16} /> Receive stock</button></>} />
      <div className="metric-grid metric-grid-small"><Metric label="Total units" value={stockTotal(data.stock)} note="Across listed warehouses" icon={Boxes} tone="blue" /><Metric label="Stock records" value={data.stock.length} note="Product / warehouse pairs" icon={Package} tone="purple" /><Metric label="Low-stock items" value={data.lowStock.length} note="At or below reorder point" icon={CircleAlert} tone="orange" /><Metric label="Warehouses" value={data.warehouses.length} note="Available locations" icon={WarehouseIcon} tone="green" /></div>
      <section className="surface table-surface"><div className="panel-heading table-heading"><div><span className="eyebrow">ON HAND</span><h2>Stock by warehouse</h2></div></div><div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>WAREHOUSE</th><th>ON HAND</th><th>REORDER AT</th><th>STATUS</th></tr></thead><tbody>
        {data.stock.map((row) => <tr key={row._id}><td><div className="table-product"><div className="product-avatar">{row.product?.imageUrl ? <img src={row.product.imageUrl} alt="" /> : <Package size={17} />}</div><div><strong>{row.product?.name || 'Product'}</strong><span className="mono">{row.product?.sku}</span></div></div></td><td>{row.warehouse?.name || '—'}</td><td><strong className={row.quantity <= (row.product?.lowStockLimit || 0) ? 'stock-warning' : ''}>{row.quantity}</strong></td><td>{row.product?.lowStockLimit ?? '—'}</td><td><Status value={row.quantity <= (row.product?.lowStockLimit || 0) ? 'Low stock' : 'Healthy'} /></td></tr>)}
        {!data.stock.length && <tr><td colSpan="5"><EmptyState icon={Boxes} title="No stock records" text="Receive products into a warehouse to start tracking inventory." /></td></tr>}
      </tbody></table></div></section>
      <section className="surface panel low-stock-panel"><div className="panel-heading"><div><span className="eyebrow">REORDER ALERTS</span><h2>Low-stock alerts</h2></div><span className="alert-count">{data.lowStock.length} alerts</span></div>
        {data.lowStock.length ? <div className="compact-list">{data.lowStock.map((row) => <div className="compact-row" key={row._id}><div className="product-avatar warning-icon"><CircleAlert size={17} /></div><div className="compact-main"><strong>{row.product?.name}</strong><span>{row.warehouse?.name} · SKU {row.product?.sku} · Limit {row.product?.lowStockLimit}</span></div><span className="stock-warning">{row.quantity} units</span></div>)}</div> : <EmptyState icon={Check} title="No low-stock alerts" text="Everything is above its reorder limit." />}
      </section>
    </>
  );
}

function WarehousesPage({ data, user, onCreate, onEdit, onDelete }) {
  return (
    <>
      <PageTitle eyebrow="LOCATIONS" title="Warehouses" description="Manage locations, responsible managers, and their active inventory." actions={user.role === 'admin' && <button className="button primary" onClick={onCreate}><Plus size={17} /> Add warehouse</button>} />
      <div className="warehouse-grid">{data.warehouses.map((warehouse) => {
        const inventory = data.stock.filter((row) => String(row.warehouse?._id) === String(warehouse._id));
        const units = stockTotal(inventory);
        return <article className="surface warehouse-card" key={warehouse._id}><div className="warehouse-art"><div className="warehouse-art-grid" /><div className="warehouse-mark"><WarehouseIcon size={25} /></div>{user.role === 'admin' && <div className="warehouse-actions"><button className="icon-button" onClick={() => onEdit(warehouse)} aria-label="Edit warehouse"><Settings2 size={16} /></button><button className="icon-button" onClick={() => onDelete(warehouse)} aria-label="Delete warehouse"><X size={16} /></button></div>}</div><div className="warehouse-body"><span className="eyebrow">WAREHOUSE</span><h2>{warehouse.name}</h2><p>{warehouse.location}</p><div className="warehouse-info"><div><span>MANAGER</span><strong>{warehouse.manager?.name || 'Unassigned'}</strong></div><div><span>STOCK UNITS</span><strong>{units.toLocaleString()}</strong></div></div><div className="capacity-track"><div style={{ width: `${warehouse.capacity ? Math.min(100, units / warehouse.capacity * 100) : 0}%` }} /></div><span className="capacity-label">{warehouse.capacity ? `${Math.round(units / warehouse.capacity * 100)}% of ${warehouse.capacity.toLocaleString()} unit capacity` : `${inventory.length} tracked stock items`}</span></div></article>;
      })}</div>
      {!data.warehouses.length && <section className="surface"><EmptyState icon={WarehouseIcon} title="No warehouses yet" text="Create a warehouse to organize stock by location." />{user.role === 'admin' && <div className="center-action"><button className="button primary" onClick={onCreate}><Plus size={16} /> Add warehouse</button></div>}</section>}
    </>
  );
}

function OrdersPage({ orders, user, onCreate, onStatus, onCancel }) {
  const canCreate = user.role === 'salesRepresentative' || user.role === 'admin';
  const canProcess = user.role === 'admin' || user.role === 'warehouseManager';
  return (
    <>
      <PageTitle eyebrow="FULFILMENT" title="Sales orders" description="Review order details, follow fulfilment status, and generate completed-order invoices." actions={canCreate && <button className="button primary" onClick={onCreate}><Plus size={17} /> New order</button>} />
      <section className="surface table-surface"><div className="table-scroll"><table><thead><tr><th>ORDER</th><th>CUSTOMER</th><th>WAREHOUSE</th><th>ITEMS</th><th>TOTAL</th><th>STATUS</th><th>CREATED</th><th /></tr></thead><tbody>
        {orders.map((order) => <tr key={order._id}><td><strong className="mono">{order.orderNumber}</strong></td><td><strong>{order.customerName}</strong><span className="cell-sub">{order.customerPhone || '—'}</span></td><td>{order.warehouse?.name || '—'}</td><td>{order.products?.reduce((sum, line) => sum + line.quantity, 0) || 0} units</td><td><strong>{currency.format(order.totalAmount)}</strong></td><td><Status value={order.status} /></td><td>{formatDate(order.createdAt)}</td><td><div className="row-actions">
          {canProcess && order.status === 'Pending' && <button className="text-button" onClick={() => onStatus(order, 'Processing')}>Process</button>}
          {canProcess && order.status === 'Processing' && <button className="text-button" onClick={() => onStatus(order, 'Completed')}>Complete</button>}
          {order.status === 'Pending' && (user.role === 'admin' || user.role === 'salesRepresentative') && <button className="text-button danger-text" onClick={() => onCancel(order)}>Cancel</button>}
          {order.status === 'Completed' && <button className="icon-button invoice-button" title="Download invoice" onClick={() => downloadInvoice(order).catch((error) => window.alert(messageOf(error)))}><Download size={16} /></button>}
        </div></td></tr>)}
        {!orders.length && <tr><td colSpan="8"><EmptyState icon={ClipboardList} title="No orders yet" text="New sales orders will appear here." /></td></tr>}
      </tbody></table></div></section>
    </>
  );
}

function TransactionsPage({ transactions }) {
  return <>
    <PageTitle eyebrow="AUDIT TRAIL" title="Stock movement" description="Every receipt, dispatch, and inter-warehouse transfer in one timeline." />
    <section className="surface table-surface"><div className="table-scroll"><table><thead><tr><th>DATE</th><th>PRODUCT</th><th>WAREHOUSE</th><th>MOVEMENT</th><th>QUANTITY</th><th>PERFORMED BY</th><th>NOTE</th></tr></thead><tbody>
      {transactions.map((item) => <tr key={item._id}><td>{formatDate(item.date)}</td><td><strong>{item.product?.name || '—'}</strong><span className="cell-sub mono">{item.product?.sku}</span></td><td>{item.warehouse?.name || '—'}</td><td><Status value={item.transactionType} /></td><td className={item.transactionType.includes('out') ? 'movement-out' : 'movement-in'}>{item.transactionType.includes('out') ? '−' : '+'}{item.quantity}</td><td>{item.performedBy?.name || '—'}</td><td className="truncate">{item.note || '—'}</td></tr>)}
      {!transactions.length && <tr><td colSpan="7"><EmptyState icon={ArrowLeftRight} title="No stock movements" text="Stock changes are recorded automatically here." /></td></tr>}
    </tbody></table></div></section>
  </>;
}

function SuppliesPage({ requests, user, products, warehouses, onCreate, onReview }) {
  return <>
    <PageTitle eyebrow="SUPPLIER PORTAL" title="Supply requests" description="Request replenishment and track approval from your warehouse team." actions={user.role === 'supplier' && <button className="button primary" onClick={onCreate}><Plus size={17} /> Submit request</button>} />
    <div className="metric-grid metric-grid-small"><Metric label="Total requests" value={requests.length} note="Requests in your workspace" icon={Truck} tone="blue" /><Metric label="Awaiting review" value={requests.filter((item) => item.status === 'Pending').length} note="Pending requests" icon={CircleAlert} tone="orange" /><Metric label="Approved" value={requests.filter((item) => item.status === 'Approved').length} note="Accepted for receiving" icon={Check} tone="green" /></div>
    <section className="surface table-surface"><div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>SUPPLIER</th><th>WAREHOUSE</th><th>QUANTITY</th><th>REQUESTED</th><th>STATUS</th><th /></tr></thead><tbody>
      {requests.map((item) => <tr key={item._id}><td><strong>{item.product?.name || products.find((p) => p._id === item.product)?.name || '—'}</strong><span className="cell-sub mono">{item.product?.sku}</span></td><td>{item.supplier?.name || 'You'}</td><td>{item.warehouse?.name || warehouses.find((w) => w._id === item.warehouse)?.name || '—'}</td><td>{item.quantity} units</td><td>{formatDate(item.createdAt)}</td><td><Status value={item.status} /></td><td>{['admin', 'warehouseManager'].includes(user.role) && item.status === 'Pending' && <div className="row-actions"><button className="text-button" onClick={() => onReview(item, 'Approved')}>Approve & receive</button><button className="text-button danger-text" onClick={() => onReview(item, 'Rejected')}>Reject</button></div>}</td></tr>)}
      {!requests.length && <tr><td colSpan="7"><EmptyState icon={Truck} title="No supply requests" text="Submitted requests and their review status will show here." /></td></tr>}
    </tbody></table></div></section>
  </>;
}

function UsersPage({ users, onCreate, onEdit, onDelete }) {
  return <>
    <PageTitle eyebrow="PEOPLE & ACCESS" title="Team & suppliers" description="Add teammates, set their role, and assign warehouse access." actions={<button className="button primary" onClick={onCreate}><Plus size={17} /> Add user</button>} />
    <div className="metric-grid metric-grid-small"><Metric label="Team members" value={users.length} note="All workspace accounts" icon={Users} tone="blue" /><Metric label="Warehouse managers" value={users.filter((item) => item.role === 'warehouseManager').length} note="Warehouse operations" icon={WarehouseIcon} tone="purple" /><Metric label="Suppliers" value={users.filter((item) => item.role === 'supplier').length} note="Supply partners" icon={Truck} tone="green" /></div>
    <section className="surface table-surface"><div className="table-scroll"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>ROLE</th><th>ASSIGNED WAREHOUSES</th><th>STATUS</th><th /></tr></thead><tbody>
      {users.map((item) => <tr key={item._id}><td><div className="table-product"><div className="avatar table-avatar">{item.image ? <img src={item.image} alt="" /> : item.name.slice(0, 1).toUpperCase()}</div><div><strong>{item.name}</strong><span>{item.phone || '—'}</span></div></div></td><td>{item.email}</td><td><span className="role-chip">{roleNames[item.role]}</span></td><td>{item.assignedWarehouses?.map((row) => row.name).join(', ') || '—'}</td><td><Status value={item.isActive ? 'Active' : 'Inactive'} /></td><td><div className="row-actions"><button className="text-button" onClick={() => onEdit(item)}>Edit</button><button className="text-button danger-text" onClick={() => onDelete(item)}>Delete</button></div></td></tr>)}
      {!users.length && <tr><td colSpan="6"><EmptyState icon={Users} title="No accounts yet" text="Create a user account to bring your team into Stockroom." /></td></tr>}
    </tbody></table></div></section>
  </>;
}

function ActivityRows({ activity }) {
  return activity.length ? <div className="compact-list">{activity.map((item) => <div className="compact-row" key={item._id}><div className="activity-avatar"><Activity size={16} /></div><div className="compact-main"><strong>{item.userName} <span className="activity-action">{item.action}</span> {item.entity}</strong><span>{item.details?.sku || item.details?.orderNumber || item.entityId} · {formatDate(item.createdAt)}</span></div><span className="activity-role">{item.details?.role || ''}</span></div>)}</div> : <EmptyState icon={Activity} title="No activity recorded" text="Stock and workspace operations will be listed here." />;
}

function ActivityPage({ activity }) {
  return <><PageTitle eyebrow="AUDIT TRAIL" title="Activity log" description="A traceable history of who changed what across your workspace." /><section className="surface panel"><ActivityRows activity={activity} /></section></>;
}

function EmptyState({ icon: Icon, title, text }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={20} /></div><strong>{title}</strong><p>{text}</p></div>;
}

function Field({ label, children, hint }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function ProductForm({ initial, products, suppliers, busy, onClose, onSubmit }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(initial?.imageUrl || '');
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setError('');
      await onSubmit({
        name: form.get('name'), sku: form.get('sku'), category: form.get('category'),
        description: form.get('description'), price: Number(form.get('price')),
        lowStockLimit: Number(form.get('lowStockLimit')), supplier: form.get('supplier') || null,
        imageUrl: initial?.imageUrl || '', imageFileId: initial?.imageFileId || '', file
      });
    } catch (requestError) { setError(messageOf(requestError)); }
  }
  return <Modal title={initial ? 'Edit product' : 'Add a product'} onClose={onClose} wide><form className="form-grid" onSubmit={submit}>
    <div className="form-photo"><div className="image-preview">{preview ? <img src={preview} alt="Product preview" /> : <Package size={25} />}</div><label className="button secondary file-button">Upload product image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const selected = event.target.files?.[0]; setFile(selected || null); if (selected) setPreview(URL.createObjectURL(selected)); }} /></label><small>ImageKit · JPEG, PNG, WebP · max 5 MB</small></div>
    <div className="form-fields">
      <Field label="Product name"><input name="name" defaultValue={initial?.name} required /></Field>
      <div className="field-pair"><Field label="SKU / barcode"><input name="sku" defaultValue={initial?.sku} required placeholder="e.g. LAP-001" /></Field><Field label="Category"><input name="category" defaultValue={initial?.category} required placeholder="Electronics" /></Field></div>
      <Field label="Description"><textarea name="description" rows="2" defaultValue={initial?.description} /></Field>
      <div className="field-pair"><Field label="Unit price (PKR)"><input name="price" type="number" min="0" step="0.01" defaultValue={initial?.price ?? 0} required /></Field><Field label="Low-stock limit"><input name="lowStockLimit" type="number" min="0" step="1" defaultValue={initial?.lowStockLimit ?? 5} required /></Field></div>
      <Field label="Supplier"><select name="supplier" defaultValue={initial?.supplier?._id || initial?.supplier || ''}><option value="">No supplier assigned</option>{suppliers.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></Field>
    </div>
    {error && <div className="notice error form-error">{error}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Add product'}</button></div>
  </form></Modal>;
}

function UserForm({ initial, warehouses, busy, onClose, onSubmit }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(initial?.image || '');
  const [selected, setSelected] = useState((initial?.assignedWarehouses || []).map((item) => String(item._id || item)));
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setError('');
      await onSubmit({
        name: form.get('name'), email: form.get('email'), phone: form.get('phone'),
        role: form.get('role'), password: form.get('password') || undefined,
        isActive: form.get('isActive') === 'true',
        assignedWarehouses: selected, image: initial?.image || '', imageFileId: initial?.imageFileId || '', file
      });
    } catch (requestError) { setError(messageOf(requestError)); }
  }
  return <Modal title={initial ? 'Edit account' : 'Create a user'} onClose={onClose} wide><form className="modal-form" onSubmit={submit}>
    <div className="profile-upload-row"><div className="avatar profile-avatar-large">{preview ? <img src={preview} alt="" /> : initial?.name?.slice(0, 1) || <UserRound size={22} />}</div><label className="button secondary file-button">Upload profile photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const selectedFile = event.target.files?.[0]; setFile(selectedFile || null); if (selectedFile) setPreview(URL.createObjectURL(selectedFile)); }} /></label></div>
    <div className="field-pair"><Field label="Full name"><input name="name" defaultValue={initial?.name} required /></Field><Field label="Email"><input name="email" type="email" defaultValue={initial?.email} required /></Field></div>
    <div className="field-pair"><Field label="Role"><select name="role" defaultValue={initial?.role || 'salesRepresentative'}><option value="admin">Administrator</option><option value="warehouseManager">Warehouse manager</option><option value="supplier">Supplier</option><option value="salesRepresentative">Sales representative</option></select></Field><Field label={initial ? 'New password (optional)' : 'Password'}><input name="password" type="password" minLength="8" required={!initial} /></Field></div>
    <div className="field-pair"><Field label="Phone"><input name="phone" defaultValue={initial?.phone} /></Field><Field label="Account status"><select name="isActive" defaultValue={String(initial?.isActive ?? true)}><option value="true">Active</option><option value="false">Inactive</option></select></Field></div>
    <Field label="Assigned warehouses" hint="Applied only when the role is Warehouse manager."><div className="checkbox-list">{warehouses.map((item) => <label key={item._id}><input type="checkbox" checked={selected.includes(item._id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, item._id] : current.filter((id) => id !== item._id))} /><span>{item.name}</span></label>)}</div></Field>
    {error && <div className="notice error">{error}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create account'}</button></div>
  </form></Modal>;
}

function WarehouseForm({ initial, users, busy, onClose, onSubmit }) {
  const managers = users.filter((item) => item.role === 'warehouseManager' && (item.isActive || item._id === initial?.manager?._id));
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSubmit({ name: form.get('name'), location: form.get('location'), manager: form.get('manager') || null, capacity: Number(form.get('capacity')) });
  }
  return <Modal title={initial ? 'Edit warehouse' : 'Add a warehouse'} onClose={onClose}><form className="modal-form" onSubmit={submit}>
    <Field label="Warehouse name"><input name="name" defaultValue={initial?.name} required /></Field><Field label="Location"><input name="location" defaultValue={initial?.location} required placeholder="City, region" /></Field>
    <Field label="Warehouse manager"><select name="manager" defaultValue={initial?.manager?._id || ''}><option value="">Unassigned</option>{managers.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}</select></Field>
    <Field label="Capacity (units)"><input name="capacity" type="number" min="0" defaultValue={initial?.capacity || 0} /></Field>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create warehouse'}</button></div>
  </form></Modal>;
}

function StockForm({ title, products, warehouses, user, busy, onClose, onSubmit }) {
  const availableWarehouses = user.role === 'warehouseManager' ? warehouses.filter((item) => user.assignedWarehouses?.includes(item._id)) : warehouses;
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSubmit({ product: form.get('product'), warehouse: form.get('warehouse'), quantity: Number(form.get('quantity')), note: form.get('note') });
  }
  return <Modal title={title} onClose={onClose}><form className="modal-form" onSubmit={submit}>
    <Field label="Product"><select name="product" required defaultValue=""><option value="" disabled>Select a product</option>{products.map((item) => <option value={item._id} key={item._id}>{item.name} · {item.sku}</option>)}</select></Field>
    <Field label="Warehouse"><select name="warehouse" required defaultValue=""><option value="" disabled>Select a warehouse</option>{availableWarehouses.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}</select></Field>
    <Field label="Quantity"><input name="quantity" type="number" min="1" step="1" required /></Field>
    <Field label="Note (optional)"><input name="note" placeholder="Purchase order, reason, reference…" /></Field>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving…' : title}</button></div>
  </form></Modal>;
}

function TransferForm({ products, warehouses, user, busy, onClose, onSubmit }) {
  const available = user.role === 'warehouseManager' ? warehouses.filter((item) => user.assignedWarehouses?.includes(item._id)) : warehouses;
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSubmit({ product: form.get('product'), fromWarehouse: form.get('fromWarehouse'), toWarehouse: form.get('toWarehouse'), quantity: Number(form.get('quantity')), note: form.get('note') });
  }
  return <Modal title="Transfer between warehouses" onClose={onClose}><form className="modal-form" onSubmit={submit}>
    <Field label="Product"><select name="product" required defaultValue=""><option value="" disabled>Select a product</option>{products.map((item) => <option value={item._id} key={item._id}>{item.name} · {item.sku}</option>)}</select></Field>
    <div className="field-pair"><Field label="From"><select name="fromWarehouse" required defaultValue=""><option value="" disabled>Source</option>{available.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}</select></Field><Field label="To"><select name="toWarehouse" required defaultValue=""><option value="" disabled>Destination</option>{available.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}</select></Field></div>
    <Field label="Quantity"><input name="quantity" type="number" min="1" required /></Field><Field label="Note"><input name="note" placeholder="Transfer reference (optional)" /></Field>
    <div className="notice info"><ArrowLeftRight size={16} /> Creates matching outgoing and incoming stock transactions.</div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Transferring…' : 'Transfer stock'}</button></div>
  </form></Modal>;
}

function OrderForm({ products, warehouses, busy, onClose, onSubmit }) {
  const [lines, setLines] = useState([{ product: '', quantity: 1 }]);
  const [error, setError] = useState('');
  const total = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * (products.find((item) => item._id === line.product)?.price || 0), 0);
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      setError('');
      await onSubmit({ customerName: form.get('customerName'), customerPhone: form.get('customerPhone'), warehouse: form.get('warehouse'), products: lines });
    } catch (requestError) { setError(messageOf(requestError)); }
  }
  return <Modal title="Create sales order" onClose={onClose} wide><form className="modal-form" onSubmit={submit}>
    <div className="field-pair"><Field label="Customer name"><input name="customerName" required /></Field><Field label="Customer phone"><input name="customerPhone" /></Field></div>
    <Field label="Fulfilment warehouse"><select name="warehouse" required defaultValue=""><option value="" disabled>Select a warehouse</option>{warehouses.map((item) => <option value={item._id} key={item._id}>{item.name}</option>)}</select></Field>
    <div className="line-items-head"><strong>Order items</strong><button className="text-button" type="button" onClick={() => setLines((current) => [...current, { product: '', quantity: 1 }])}><Plus size={14} /> Add line</button></div>
    {lines.map((line, index) => <div className="order-line" key={index}><select aria-label="Product" value={line.product} required onChange={(event) => setLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, product: event.target.value } : item))}><option value="" disabled>Select product</option>{products.map((item) => <option key={item._id} value={item._id}>{item.name} · {currency.format(item.price)}</option>)}</select><input aria-label="Quantity" type="number" min="1" value={line.quantity} required onChange={(event) => setLines((current) => current.map((item, lineIndex) => lineIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} /><button className="icon-button" type="button" aria-label="Remove item" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><X size={16} /></button></div>)}
    <div className="order-total"><span>Estimated total</span><strong>{currency.format(total)}</strong><small>Price and stock availability are verified by the server.</small></div>
    {error && <div className="notice error">{error}</div>}
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Creating…' : 'Create pending order'}</button></div>
  </form></Modal>;
}

function SupplyForm({ products, warehouses, busy, onClose, onSubmit }) {
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await onSubmit({ product: form.get('product'), warehouse: form.get('warehouse'), quantity: Number(form.get('quantity')) });
  }
  return <Modal title="Submit supply request" onClose={onClose}><form className="modal-form" onSubmit={submit}>
    <Field label="My product"><select name="product" required defaultValue=""><option value="" disabled>Select a product</option>{products.map((item) => <option key={item._id} value={item._id}>{item.name} · {item.sku}</option>)}</select></Field>
    <Field label="Deliver to"><select name="warehouse" required defaultValue=""><option value="" disabled>Select a warehouse</option>{warehouses.map((item) => <option key={item._id} value={item._id}>{item.name}</option>)}</select></Field>
    <Field label="Quantity"><input name="quantity" type="number" min="1" required /></Field>
    <div className="notice info"><Truck size={16} /> Once approved, stock is added to the selected warehouse.</div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Sending…' : 'Submit request'}</button></div>
  </form></Modal>;
}

function ProfilePage({ user, onSave }) {
  const [preview, setPreview] = useState(user.image || '');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage('');
    try {
      await onSave({ name: form.get('name'), phone: form.get('phone'), file });
      setMessage('Profile saved successfully.');
    } catch (error) { setMessage(messageOf(error)); }
    finally { setBusy(false); }
  }
  return <><PageTitle eyebrow="ACCOUNT SETTINGS" title="My profile" description="Manage your supplier contact details and profile image." /><section className="surface profile-card"><form className="modal-form profile-form" onSubmit={submit}><div className="profile-upload-row"><div className="avatar profile-avatar-large">{preview ? <img src={preview} alt="" /> : user.name.slice(0, 1)}</div><label className="button secondary file-button">Upload supplier logo / photo<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { const selected = event.target.files?.[0]; setFile(selected || null); if (selected) setPreview(URL.createObjectURL(selected)); }} /></label><span className="form-hint">ImageKit · max 5 MB</span></div><Field label="Full name"><input name="name" defaultValue={user.name} required /></Field><Field label="Email address"><input value={user.email} disabled /></Field><Field label="Phone"><input name="phone" defaultValue={user.phone} /></Field><Field label="Account role"><input value={roleNames[user.role]} disabled /></Field>{message && <div className={`notice ${message.includes('successfully') ? '' : 'error'}`}>{message}</div>}<div><button className="button primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div></form></section></>;
}
