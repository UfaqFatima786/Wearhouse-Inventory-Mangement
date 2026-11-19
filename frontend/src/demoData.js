const now = Date.now();
const daysAgo = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

const managers = [
  { _id: 'demo-user-manager-1', name: 'Hassan Raza' },
  { _id: 'demo-user-manager-2', name: 'Sara Malik' }
];

const suppliers = [
  { _id: 'demo-user-supplier-1', name: 'Northstar Supply Co.' },
  { _id: 'demo-user-supplier-2', name: 'Evergreen Wholesale' }
];

const warehouses = [
  { _id: 'demo-warehouse-1', name: 'Central Distribution', location: 'Lahore, Punjab', capacity: 12000, manager: managers[0] },
  { _id: 'demo-warehouse-2', name: 'North Hub', location: 'Islamabad, ICT', capacity: 8500, manager: managers[1] },
  { _id: 'demo-warehouse-3', name: 'South Fulfilment', location: 'Karachi, Sindh', capacity: 10000, manager: managers[0] }
];

const products = [
  { _id: 'demo-product-1', name: 'Wireless Barcode Scanner', sku: 'WH-SCN-204', category: 'Equipment', description: 'Wireless 2D scanner with USB-C charging dock', price: 18500, available: 84, lowStockLimit: 20, supplier: suppliers[0], warehouseStock: [{ warehouse: warehouses[0] }, { warehouse: warehouses[1] }, { warehouse: warehouses[2] }] },
  { _id: 'demo-product-2', name: 'Thermal Label Roll', sku: 'PK-LBL-058', category: 'Packaging', description: 'Durable 4 × 6 inch shipping labels', price: 1250, available: 14, lowStockLimit: 25, supplier: suppliers[1], warehouseStock: [{ warehouse: warehouses[0] }, { warehouse: warehouses[1] }] },
  { _id: 'demo-product-3', name: 'Protective Shipping Box', sku: 'PK-BOX-112', category: 'Packaging', description: 'Double-wall corrugated carton, medium', price: 420, available: 368, lowStockLimit: 80, supplier: suppliers[1], warehouseStock: [{ warehouse: warehouses[0] }, { warehouse: warehouses[1] }, { warehouse: warehouses[2] }] },
  { _id: 'demo-product-4', name: 'Handheld Inventory Tablet', sku: 'WH-TAB-320', category: 'Technology', description: 'Rugged handheld tablet for warehouse teams', price: 64500, available: 32, lowStockLimit: 10, supplier: suppliers[0], warehouseStock: [{ warehouse: warehouses[0] }, { warehouse: warehouses[1] }] },
  { _id: 'demo-product-5', name: 'Pallet Stretch Wrap', sku: 'PK-WRP-076', category: 'Packaging', description: 'Clear 500 mm stretch film, 300 m roll', price: 1980, available: 9, lowStockLimit: 18, supplier: suppliers[1], warehouseStock: [{ warehouse: warehouses[0] }] },
  { _id: 'demo-product-6', name: 'Safety Work Gloves', sku: 'SF-GLV-041', category: 'Safety', description: 'Cut-resistant grip gloves, pair', price: 890, available: 126, lowStockLimit: 30, supplier: suppliers[0], warehouseStock: [{ warehouse: warehouses[2] }] }
];

const stock = [
  { _id: 'demo-stock-1', product: products[0], warehouse: warehouses[0], quantity: 36 },
  { _id: 'demo-stock-2', product: products[0], warehouse: warehouses[1], quantity: 28 },
  { _id: 'demo-stock-3', product: products[0], warehouse: warehouses[2], quantity: 20 },
  { _id: 'demo-stock-4', product: products[1], warehouse: warehouses[0], quantity: 8 },
  { _id: 'demo-stock-5', product: products[1], warehouse: warehouses[1], quantity: 6 },
  { _id: 'demo-stock-6', product: products[2], warehouse: warehouses[0], quantity: 180 },
  { _id: 'demo-stock-7', product: products[2], warehouse: warehouses[1], quantity: 108 },
  { _id: 'demo-stock-8', product: products[2], warehouse: warehouses[2], quantity: 80 },
  { _id: 'demo-stock-9', product: products[3], warehouse: warehouses[0], quantity: 18 },
  { _id: 'demo-stock-10', product: products[3], warehouse: warehouses[1], quantity: 14 },
  { _id: 'demo-stock-11', product: products[5], warehouse: warehouses[2], quantity: 126 },
  { _id: 'demo-stock-12', product: products[4], warehouse: warehouses[0], quantity: 9 }
];

const users = [
  { _id: 'demo-user-admin', name: 'Ayesha Khan', email: 'ayesha@example.com', role: 'admin', phone: '+92 300 1234567', isActive: true, assignedWarehouses: [] },
  { ...managers[0], email: 'hassan@example.com', role: 'warehouseManager', isActive: true, assignedWarehouses: [warehouses[0], warehouses[2]] },
  { ...managers[1], email: 'sara@example.com', role: 'warehouseManager', isActive: true, assignedWarehouses: [warehouses[1]] },
  { ...suppliers[0], email: 'orders@northstar.example', role: 'supplier', isActive: true, assignedWarehouses: [] },
  { ...suppliers[1], email: 'hello@evergreen.example', role: 'supplier', isActive: true, assignedWarehouses: [] },
  { _id: 'demo-user-sales-1', name: 'Bilal Ahmed', email: 'bilal@example.com', role: 'salesRepresentative', isActive: true, assignedWarehouses: [] }
];

const lowStockItems = [
  { _id: 'demo-low-1', product: products[1], warehouse: warehouses[0], quantity: 8 },
  { _id: 'demo-low-2', product: products[4], warehouse: warehouses[0], quantity: 9 },
  { _id: 'demo-low-3', product: products[1], warehouse: warehouses[1], quantity: 6 }
];

const orders = [
  { _id: 'demo-order-1', orderNumber: 'SO-2026-1048', customerName: 'Metro Retail Group', customerPhone: '+92 300 5550101', warehouse: warehouses[0], products: [{ product: products[0], quantity: 4, price: products[0].price }, { product: products[1], quantity: 12, price: products[1].price }], totalAmount: 89000, status: 'Processing', createdAt: daysAgo(1), updatedAt: daysAgo(1) },
  { _id: 'demo-order-2', orderNumber: 'SO-2026-1047', customerName: 'Urban Cart', customerPhone: '+92 300 5550102', warehouse: warehouses[1], products: [{ product: products[2], quantity: 40, price: products[2].price }], totalAmount: 16800, status: 'Pending', createdAt: daysAgo(2) },
  { _id: 'demo-order-3', orderNumber: 'SO-2026-1046', customerName: 'Brightline Stores', customerPhone: '+92 300 5550103', warehouse: warehouses[2], products: [{ product: products[3], quantity: 3, price: products[3].price }], totalAmount: 193500, status: 'Completed', createdAt: daysAgo(4), updatedAt: daysAgo(3) },
  { _id: 'demo-order-4', orderNumber: 'SO-2026-1045', customerName: 'Summit Office Supply', customerPhone: '+92 300 5550104', warehouse: warehouses[0], products: [{ product: products[5], quantity: 18, price: products[5].price }], totalAmount: 16020, status: 'Completed', createdAt: daysAgo(6), updatedAt: daysAgo(5) },
  { _id: 'demo-order-5', orderNumber: 'SO-2026-1044', customerName: 'Daily Needs Mart', customerPhone: '+92 300 5550105', warehouse: warehouses[1], products: [{ product: products[1], quantity: 24, price: products[1].price }], totalAmount: 30000, status: 'Pending', createdAt: daysAgo(8) }
];

const transactions = [
  { _id: 'demo-transaction-1', date: daysAgo(0), product: products[2], warehouse: warehouses[0], transactionType: 'stock-in', quantity: 120, performedBy: managers[0], note: 'Purchase order PO-381' },
  { _id: 'demo-transaction-2', date: daysAgo(1), product: products[1], warehouse: warehouses[0], transactionType: 'stock-out', quantity: 12, performedBy: managers[0], note: 'Sales order SO-2026-1048' },
  { _id: 'demo-transaction-3', date: daysAgo(2), product: products[0], warehouse: warehouses[1], transactionType: 'stock-in', quantity: 16, performedBy: managers[1], note: 'Replenishment received' },
  { _id: 'demo-transaction-4', date: daysAgo(3), product: products[3], warehouse: warehouses[2], transactionType: 'stock-out', quantity: 3, performedBy: managers[0], note: 'Sales order SO-2026-1046' },
  { _id: 'demo-transaction-5', date: daysAgo(5), product: products[5], warehouse: warehouses[2], transactionType: 'stock-in', quantity: 50, performedBy: managers[0], note: 'Safety stock top-up' },
  { _id: 'demo-transaction-6', date: daysAgo(7), product: products[4], warehouse: warehouses[0], transactionType: 'stock-out', quantity: 5, performedBy: managers[0], note: 'Dispatch to customer' }
];

const requests = [
  { _id: 'demo-request-1', product: products[1], supplier: suppliers[1], warehouse: warehouses[0], quantity: 100, status: 'Pending', createdAt: daysAgo(1) },
  { _id: 'demo-request-2', product: products[4], supplier: suppliers[1], warehouse: warehouses[1], quantity: 60, status: 'Approved', createdAt: daysAgo(3) },
  { _id: 'demo-request-3', product: products[0], supplier: suppliers[0], warehouse: warehouses[2], quantity: 24, status: 'Approved', createdAt: daysAgo(6) }
];

const activity = [
  { _id: 'demo-activity-1', userName: 'Hassan Raza', action: 'received stock for', entity: 'Protective Shipping Box', entityId: 'demo-product-3', createdAt: daysAgo(0), details: { sku: 'PK-BOX-112', role: 'Warehouse manager' } },
  { _id: 'demo-activity-2', userName: 'Ayesha Khan', action: 'approved supply request', entity: 'SR-2026-031', entityId: 'demo-request-2', createdAt: daysAgo(1), details: { role: 'Administrator' } },
  { _id: 'demo-activity-3', userName: 'Bilal Ahmed', action: 'created sales order', entity: 'SO-2026-1048', entityId: 'demo-order-1', createdAt: daysAgo(2), details: { orderNumber: 'SO-2026-1048', role: 'Sales representative' } },
  { _id: 'demo-activity-4', userName: 'Sara Malik', action: 'transferred stock to', entity: 'North Hub', entityId: 'demo-warehouse-2', createdAt: daysAgo(3), details: { sku: 'WH-SCN-204', role: 'Warehouse manager' } }
];

const salesByMonth = [740000, 860000, 920000, 1080000, 980000, 1250000, 1180000, 1420000, 1360000, 1580000, 1490000, 1710000];
const stockInByMonth = [182, 240, 216, 310, 275, 348, 322, 390, 365, 428, 405, 452];
const stockOutByMonth = [146, 198, 180, 252, 230, 288, 274, 332, 310, 365, 348, 390];

export const demoData = {
  dashboard: {
    stats: { users: 18, products: products.length, warehouses: warehouses.length, suppliers: 4, orders: 128, pendingOrders: 9, lowStock: lowStockItems.length, transactions: 642, supplyRequests: requests.length },
    charts: {
      sales: salesByMonth.map((revenue, index) => ({ _id: index + 1, revenue, orders: 8 + index })),
      stockMovement: stockInByMonth.flatMap((quantity, index) => [
        { _id: { month: index + 1, type: 'stock-in' }, quantity },
        { _id: { month: index + 1, type: 'stock-out' }, quantity: stockOutByMonth[index] }
      ]),
      topProducts: [
        { _id: products[2]._id, name: products[2].name, units: 486, revenue: 204120 },
        { _id: products[5]._id, name: products[5].name, units: 352, revenue: 313280 },
        { _id: products[1]._id, name: products[1].name, units: 288, revenue: 360000 },
        { _id: products[0]._id, name: products[0].name, units: 164, revenue: 303400 },
        { _id: products[4]._id, name: products[4].name, units: 108, revenue: 213840 }
      ]
    },
    lowStockItems,
    activity
  },
  products,
  stock,
  lowStock: lowStockItems,
  warehouses,
  orders,
  users,
  transactions,
  requests,
  activity
};
