export type AppMode = 'supplier' | 'broker';

export type BrokerCategory = 'Nearby' | 'High Profit' | 'Newest' | 'Electronics';

export type BrokerFeedItem = {
  id: string;
  title: string;
  subtitle: string;
  hubName: string;
  city: string;
  floorPriceCents: number;
  claimFeeCents: number;
  potentialProfitCents: number;
  photoCount: number;
  aiIngestionConfidence: number;
  tags: string[];
  gradeLabel: string;
  imageUrl: string;
  sellerBadges: string[];
  hubId?: string;
  shippable: boolean;
};

export type SupplierItemStatus = 'available' | 'claimed' | 'pending_pickup';

export type SupplierItem = {
  id: string;
  sku: string;
  title: string;
  subtitle: string;
  askPriceCents: number;
  status: SupplierItemStatus;
  quantity: number;
  thumbUrl: string;
  brokerActivity: 'Low' | 'Medium' | 'High' | 'Very High';
};

export type SupplierMetric = {
  label: string;
  value: string;
  delta: string;
  tone: 'neutral' | 'positive' | 'accent';
};

export type ClaimSnapshot = {
  id: string;
  itemId: string;
  itemTitle: string;
  brokerName: string;
  supplierName: string;
  status: 'active' | 'listed_externally' | 'buyer_committed' | 'awaiting_pickup' | 'completed';
  expiresAt: string;
  lifecycleStage: 'inventoried' | 'claimed' | 'listed' | 'sold';
  claimFeeCents: number;
  estimatedProfitCents: number;
};

export type ItemDetail = {
  id: string;
  sku: string;
  title: string;
  description: string;
  gradeLabel: string;
  imageUrl: string;
  lifecycleStage: 'inventoried' | 'claimed' | 'listed' | 'sold';
  estimatedProfitCents: number;
  marketVelocityLabel: string;
  claimFeeCents: number;
};

export type RecentFlip = {
  title: string;
  profitCents: number;
  agoLabel: string;
};

export type AiInsight = {
  id: string;
  title: string;
  description: string;
  source: string;
  action: 'Apply' | 'View';
  tone: 'accent' | 'warning' | 'info' | 'positive';
};

export type CrosslistingDescription = {
  platform: string;
  description: string;
  pushLabel: string;
  copyLabel: string;
  tone: 'accent' | 'neutral' | 'warning';
};

export const brokerCategories: BrokerCategory[] = ['Nearby', 'High Profit', 'Newest', 'Electronics'];

export const brokerFeed: BrokerFeedItem[] = [
  {
    id: 'itm_001',
    title: 'iPhone 13 Pro',
    subtitle: 'Sierra Blue • 256GB • Unlocked',
    hubName: 'Hub: St. Louis Downtown',
    city: 'St. Louis',
    floorPriceCents: 48000,
    claimFeeCents: 500,
    potentialProfitCents: 4500,
    photoCount: 9,
    aiIngestionConfidence: 0.94,
    tags: ['OEM verified', 'Like new', 'Fast pickup'],
    gradeLabel: 'Like New',
    hubId: 'hub_stl_downtown',
    imageUrl:
      'https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=1280&q=80',
    sellerBadges: ['JD', 'TA'],
    shippable: true,
  },
  {
    id: 'itm_002',
    title: 'Mid-Century Modern Chair',
    subtitle: 'Teak Wood • Original Upholstery',
    hubName: 'Hub: West End',
    city: 'St. Louis',
    floorPriceCents: 14000,
    claimFeeCents: 350,
    potentialProfitCents: 8000,
    photoCount: 6,
    aiIngestionConfidence: 0.9,
    tags: ['Condition good', 'Local demand'],
    gradeLabel: 'Good',
    hubId: 'hub_stl_west_end',
    imageUrl:
      'https://images.unsplash.com/photo-1598300056393-4aac492f4344?auto=format&fit=crop&w=1280&q=80',
    sellerBadges: ['MK'],
    shippable: false,
  },
  {
    id: 'itm_003',
    title: 'Vintage Leather Biker Jacket',
    subtitle: '1980s • Distressed Finish • Heavy Hardware',
    hubName: 'Hub: Brooklyn North',
    city: 'New York',
    floorPriceCents: 32000,
    claimFeeCents: 200,
    potentialProfitCents: 6500,
    photoCount: 12,
    aiIngestionConfidence: 0.984,
    tags: ['Premium grade', 'Collector market'],
    gradeLabel: 'Premium Grade',
    hubId: 'hub_brooklyn_north',
    imageUrl:
      'https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?auto=format&fit=crop&w=1280&q=80',
    sellerBadges: ['AR'],
    shippable: true,
  },
  {
    id: 'itm_004',
    title: 'Sony WH-1000XM4 Headphones',
    subtitle: 'Used • Good • Case Included',
    hubName: 'Hub: Pilsen Depot',
    city: 'Chicago',
    floorPriceCents: 12000,
    claimFeeCents: 200,
    potentialProfitCents: 3800,
    photoCount: 5,
    aiIngestionConfidence: 0.98,
    tags: ['Electronics', 'Fast flip'],
    gradeLabel: 'Used - Good',
    hubId: 'hub_pilsen_depot',
    imageUrl:
      'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=1280&q=80',
    sellerBadges: ['SC'],
    shippable: true,
  },
];

export const supplierMetrics: SupplierMetric[] = [
  {
    label: 'Gross Volume (30D)',
    value: '$48,250.75',
    delta: '+15.4% vs last month',
    tone: 'positive',
  },
  {
    label: 'Active Inventory',
    value: '250',
    delta: '+10 New',
    tone: 'neutral',
  },
  {
    label: 'Avg. Sale Value',
    value: '$192.50',
    delta: 'High Perf',
    tone: 'accent',
  },
];

export const supplierQueue: SupplierItem[] = [
  {
    id: 'sup_001',
    sku: '88293-1',
    title: 'Sony WH-1000XM4 Headphones',
    subtitle: 'Black-ear, over-ear',
    askPriceCents: 24000,
    status: 'available',
    quantity: 25,
    thumbUrl:
      'https://images.unsplash.com/photo-1546435770-a3e426bf472b?auto=format&fit=crop&w=400&q=80',
    brokerActivity: 'High',
  },
  {
    id: 'sup_002',
    sku: '11920-4',
    title: 'Nike Air Zoom Pegasus',
    subtitle: 'Running shoe',
    askPriceCents: 8500,
    status: 'claimed',
    quantity: 12,
    thumbUrl:
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80',
    brokerActivity: 'Medium',
  },
  {
    id: 'sup_003',
    sku: '44092-2',
    title: 'Modern Wrist Watch',
    subtitle: 'Chronograph',
    askPriceCents: 15000,
    status: 'pending_pickup',
    quantity: 5,
    thumbUrl:
      'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=400&q=80',
    brokerActivity: 'Low',
  },
  {
    id: 'sup_004',
    sku: '22841-A',
    title: 'Apple Watch Series 8',
    subtitle: 'Smartwatch',
    askPriceCents: 32000,
    status: 'available',
    quantity: 18,
    thumbUrl:
      'https://images.unsplash.com/photo-1617043786394-f977fa12eddf?auto=format&fit=crop&w=400&q=80',
    brokerActivity: 'High',
  },
  {
    id: 'sup_005',
    sku: '53678-D',
    title: 'Dyson V15 Detect Absolute',
    subtitle: 'Vacuum cleaner',
    askPriceCents: 65000,
    status: 'available',
    quantity: 8,
    thumbUrl:
      'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?auto=format&fit=crop&w=400&q=80',
    brokerActivity: 'Very High',
  },
];

export const claimSnapshots: ClaimSnapshot[] = [
  {
    id: 'clm_101',
    itemId: 'itm_001',
    itemTitle: 'iPhone 13 Pro',
    brokerName: 'Maya R.',
    supplierName: 'St. Louis Downtown',
    status: 'listed_externally',
    lifecycleStage: 'listed',
    claimFeeCents: 500,
    estimatedProfitCents: 4500,
    expiresAt: '2026-03-07T21:00:00Z',
  },
  {
    id: 'clm_102',
    itemId: 'itm_002',
    itemTitle: 'Mid-Century Chair',
    brokerName: 'Nate C.',
    supplierName: 'West End',
    status: 'awaiting_pickup',
    lifecycleStage: 'sold',
    claimFeeCents: 350,
    estimatedProfitCents: 8000,
    expiresAt: '2026-03-05T20:00:00Z',
  },
  {
    id: 'clm_103',
    itemId: 'itm_004',
    itemTitle: 'Sony WH-1000XM4 Headphones',
    brokerName: 'Alex T.',
    supplierName: 'Pilsen Depot',
    status: 'buyer_committed',
    lifecycleStage: 'claimed',
    claimFeeCents: 200,
    estimatedProfitCents: 3800,
    expiresAt: '2026-03-08T17:30:00Z',
  },
];

export const itemDetailsById: Record<string, ItemDetail> = {
  itm_001: {
    id: 'itm_001',
    sku: 'TATO-7734-P',
    title: 'iPhone 13 Pro',
    description:
      'Single-owner device with excellent battery health and clean IMEI check. Gemini extracted accessories and cosmetic grade for high-conversion marketplace copy.',
    gradeLabel: 'Premium Grade',
    imageUrl:
      'https://images.unsplash.com/photo-1632661674596-df8be070a5c5?auto=format&fit=crop&w=1280&q=80',
    lifecycleStage: 'claimed',
    estimatedProfitCents: 4500,
    marketVelocityLabel: 'High',
    claimFeeCents: 500,
  },
  itm_002: {
    id: 'itm_002',
    sku: 'TATO-4411-C',
    title: 'Mid-Century Modern Chair',
    description:
      'Solid teak frame with original upholstery. AI highlighted style keywords and local demand for premium furnishing searches in nearby marketplaces.',
    gradeLabel: 'Good',
    imageUrl:
      'https://images.unsplash.com/photo-1598300056393-4aac492f4344?auto=format&fit=crop&w=1280&q=80',
    lifecycleStage: 'listed',
    estimatedProfitCents: 8000,
    marketVelocityLabel: 'Medium',
    claimFeeCents: 350,
  },
  itm_003: {
    id: 'itm_003',
    sku: 'TATO-7721-X',
    title: 'Vintage Leather Biker Jacket',
    description:
      'Authentic 1980s vintage leather jacket with natural distressed finish and heavy-duty chrome hardware. Optimized for high-margin resale on secondary marketplaces.',
    gradeLabel: 'Premium Grade',
    imageUrl:
      'https://images.unsplash.com/photo-1521223890158-f9f7c3d5d504?auto=format&fit=crop&w=1280&q=80',
    lifecycleStage: 'inventoried',
    estimatedProfitCents: 6500,
    marketVelocityLabel: 'High',
    claimFeeCents: 200,
  },
  itm_004: {
    id: 'itm_004',
    sku: 'TATO-8891-H',
    title: 'Sony WH-1000XM4 Headphones',
    description:
      'Noise-canceling headphones scanned by Gemini for wear level, model confirmation, and realistic floor pricing. Includes carrying case and charging cable.',
    gradeLabel: 'Used - Good',
    imageUrl:
      'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=1280&q=80',
    lifecycleStage: 'claimed',
    estimatedProfitCents: 3800,
    marketVelocityLabel: 'High',
    claimFeeCents: 200,
  },
};

export function formatUSD(cents: number, fractionDigits = 0) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  }).format(cents / 100);
}

export const lifecycleStages: Array<ItemDetail['lifecycleStage']> = ['inventoried', 'claimed', 'listed', 'sold'];

// --- New mock data for design overhaul ---

export const recentFlips: RecentFlip[] = [
  { title: 'iPhone 14 Pro', profitCents: 30000, agoLabel: '1m ago' },
  { title: 'Sony WH-1000XM4', profitCents: 8000, agoLabel: '5m ago' },
  { title: 'Nike Air Jordans', profitCents: 15000, agoLabel: '12m ago' },
  { title: 'MacBook Pro M2', profitCents: 45000, agoLabel: '18m ago' },
  { title: 'Dyson V15 Detect', profitCents: 12000, agoLabel: '25m ago' },
  { title: 'Herman Miller Aeron', profitCents: 35000, agoLabel: '32m ago' },
];

export const sparklineData = {
  revenue: [120, 180, 160, 220, 280, 310, 350, 400, 380, 420, 460, 482],
  inventory: [200, 210, 205, 215, 230, 225, 240, 238, 242, 248, 245, 250],
  avgSale: [150, 160, 155, 170, 180, 175, 185, 190, 188, 192, 190, 192],
};

export const aiInsights: AiInsight[] = [
  {
    id: 'ai_001',
    title: 'Price Adjustment',
    description: 'Increase Sony WH-1000XM4 by 5% based on high demand.',
    source: 'Gemini',
    action: 'Apply',
    tone: 'accent',
  },
  {
    id: 'ai_002',
    title: 'High-Demand Alert',
    description: 'Smart Home devices are trending. Consider restocking.',
    source: 'Gemini',
    action: 'Apply',
    tone: 'positive',
  },
  {
    id: 'ai_003',
    title: 'Inventory Optimization',
    description: 'Reduce Modern Wrist Watch stock by 20% due to low broker activity.',
    source: 'Gemini',
    action: 'View',
    tone: 'warning',
  },
  {
    id: 'ai_004',
    title: 'Gemini Price Prediction',
    description: 'Apple Watch Series 8 value expected to hold stable.',
    source: 'Gemini',
    action: 'Apply',
    tone: 'info',
  },
];

export const crosslistingDescriptions: Record<string, CrosslistingDescription[]> = {
  itm_001: [
    {
      platform: 'eBay',
      description:
        'Apple iPhone 13 Pro – Sierra Blue, 256GB, Unlocked. Excellent condition with clean IMEI. Battery health 92%. Includes original box, cable, and case. Fast shipping available.',
      pushLabel: 'Push to eBay',
      copyLabel: 'Copy eBay',
      tone: 'accent',
    },
    {
      platform: 'FB Marketplace',
      description:
        'iPhone 13 Pro 256GB Sierra Blue – Unlocked, works on any carrier. Like-new condition, no scratches. Pickup in St. Louis downtown or can ship. Serious buyers only.',
      pushLabel: 'Push to FB',
      copyLabel: 'Copy FB',
      tone: 'neutral',
    },
    {
      platform: 'Mercari',
      description:
        'iPhone 13 Pro Sierra Blue 256GB Unlocked. Battery health 92%, clean IMEI verified. Comes with original accessories. Price firm, ships next day.',
      pushLabel: 'Push to Mercari',
      copyLabel: 'Copy Mercari',
      tone: 'warning',
    },
  ],
  itm_004: [
    {
      platform: 'eBay',
      description:
        'Sony WH-1000XM4 Wireless Noise Canceling Headphones – Black. Used, good condition. Includes carrying case and USB-C cable. Industry-leading noise cancellation.',
      pushLabel: 'Push to eBay',
      copyLabel: 'Copy eBay',
      tone: 'accent',
    },
    {
      platform: 'FB Marketplace',
      description:
        'Sony WH-1000XM4 headphones in great condition. Noise canceling works perfectly. Comes with case and charger. Local pickup or shipping available.',
      pushLabel: 'Push to FB',
      copyLabel: 'Copy FB',
      tone: 'neutral',
    },
    {
      platform: 'Mercari',
      description:
        'Sony WH-1000XM4 Over-Ear Headphones. Used Good condition with original carrying case. Ships within 24 hours.',
      pushLabel: 'Push to Mercari',
      copyLabel: 'Copy Mercari',
      tone: 'warning',
    },
  ],
};

export const actionQueueStats = [
  { label: 'Items awaiting labels', value: 12 },
  { label: 'Pending pickups', value: 5 },
  { label: 'Claims awaiting confirmation', value: 3 },
  { label: 'Low-stock alerts', value: 4 },
];
