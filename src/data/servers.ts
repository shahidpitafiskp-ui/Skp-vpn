import { ServerLocation, SplitTunnelApp, Language } from '../types/vpn';

export const SERVER_LOCATIONS: ServerLocation[] = [
  {
    id: 'auto',
    countryCode: 'AUTO',
    region: 'auto',
    nameEn: 'Auto select',
    nameUr: 'آٹو سلیکٹ (بہترین سرور)',
    cityEn: 'Fastest Optimal Node',
    cityUr: 'تیز ترین سرور',
    virtualIp: '104.28.194.72',
    basePingMs: 24,
    loadPercent: 28,
  },
  {
    id: 'ae-1',
    countryCode: 'AE',
    region: 'asia_me',
    nameEn: 'United Arab Emirates',
    nameUr: 'متحدہ عرب امارات (دبئی)',
    cityEn: 'Dubai',
    cityUr: 'دبئی',
    virtualIp: '91.74.112.19',
    basePingMs: 21,
    loadPercent: 22,
  },
  {
    id: 'sg-1',
    countryCode: 'SG',
    region: 'asia_me',
    nameEn: 'Singapore',
    nameUr: 'سنگاپور',
    cityEn: 'Jurong East',
    cityUr: 'جورونگ ایسٹ',
    virtualIp: '139.99.62.118',
    basePingMs: 34,
    loadPercent: 36,
  },
  {
    id: 'jp-1',
    countryCode: 'JP',
    region: 'asia_me',
    nameEn: 'Japan',
    nameUr: 'جاپان (ٹوکیو)',
    cityEn: 'Tokyo',
    cityUr: 'ٹوکیو',
    virtualIp: '45.32.248.92',
    basePingMs: 41,
    loadPercent: 25,
  },
  {
    id: 'de-1',
    countryCode: 'DE',
    region: 'europe',
    nameEn: 'Germany',
    nameUr: 'جرمنی',
    cityEn: 'Frankfurt',
    cityUr: 'فرینکفرٹ',
    virtualIp: '185.220.101.44',
    basePingMs: 47,
    loadPercent: 35,
  },
  {
    id: 'ch-1',
    countryCode: 'CH',
    region: 'europe',
    nameEn: 'Switzerland',
    nameUr: 'سوئٹزرلینڈ',
    cityEn: 'Zurich',
    cityUr: 'زیورخ',
    virtualIp: '179.43.146.203',
    basePingMs: 46,
    loadPercent: 19,
  },
  {
    id: 'nl-1',
    countryCode: 'NL',
    region: 'europe',
    nameEn: 'Netherlands',
    nameUr: 'نیدرلینڈز',
    cityEn: 'Amsterdam',
    cityUr: 'ایمسٹرڈیم',
    virtualIp: '94.142.241.110',
    basePingMs: 49,
    loadPercent: 32,
  },
  {
    id: 'uk-1',
    countryCode: 'GB',
    region: 'europe',
    nameEn: 'United Kingdom',
    nameUr: 'برطانیہ',
    cityEn: 'London',
    cityUr: 'لندن',
    virtualIp: '51.89.153.209',
    basePingMs: 53,
    loadPercent: 41,
  },
  {
    id: 'fr-1',
    countryCode: 'FR',
    region: 'europe',
    nameEn: 'France',
    nameUr: 'فرانس',
    cityEn: 'Paris',
    cityUr: 'پیرس',
    virtualIp: '51.158.114.63',
    basePingMs: 55,
    loadPercent: 38,
  },
  {
    id: 'us-east',
    countryCode: 'US',
    region: 'americas',
    nameEn: 'United States (East)',
    nameUr: 'امریکہ (نیویارک)',
    cityEn: 'New York',
    cityUr: 'نیویارک',
    virtualIp: '198.54.132.85',
    basePingMs: 74,
    loadPercent: 44,
  },
  {
    id: 'us-west',
    countryCode: 'US',
    region: 'americas',
    nameEn: 'United States (West)',
    nameUr: 'امریکہ (لاس اینجلس)',
    cityEn: 'Los Angeles',
    cityUr: 'لاس اینجلس',
    virtualIp: '172.104.219.14',
    basePingMs: 68,
    loadPercent: 27,
  },
  {
    id: 'ca-1',
    countryCode: 'CA',
    region: 'americas',
    nameEn: 'Canada',
    nameUr: 'کینیڈا',
    cityEn: 'Toronto',
    cityUr: 'ٹورنٹو',
    virtualIp: '149.56.23.191',
    basePingMs: 81,
    loadPercent: 29,
  },
];

export const INITIAL_SPLIT_APPS: SplitTunnelApp[] = [
  { id: 'chrome', name: 'Web Browsers (Chrome / Safari)', category: 'Browsing', enabled: true },
  { id: 'youtube', name: 'Video & HD Streaming', category: 'Media', enabled: true },
  { id: 'whatsapp', name: 'Voice & Messaging Calls', category: 'Communication', enabled: true },
  { id: 'gaming', name: 'Low-Ping Online Games', category: 'Gaming', enabled: true },
  { id: 'banking', name: 'Local Banking & Payments', category: 'Bypass Recommended', enabled: false },
];

export const UI_STRINGS: Record<
  Language,
  {
    appName: string;
    bannerText: string;
    bannerCta: string;
    ready: string;
    connecting: string;
    connected: string;
    disconnecting: string;
    reconnecting: string;
    connectionDropped: string;
    connectBtn: string;
    disconnectBtn: string;
    cancelBtn: string;
    freeLabel: string;
    selectServer: string;
    speedTest: string;
    checkSpeedNow: string;
    splitTunnel: string;
    batteryFix: string;
    protocol: string;
    download: string;
    upload: string;
    duration: string;
    virtualIp: string;
    autoReconnect: string;
    lastServer: string;
    testDrop: string;
    retryNow: string;
  }
> = {
  en: {
    appName: 'SKP VPN',
    bannerText:
      'Please disable battery optimization from Android settings to fix issues of disconnections and no network traffic. A quick 5-star ★★★★★ review would mean the world to us!',
    bannerCta: 'Click here to support!',
    ready: 'Ready to connect',
    connecting: 'Connecting...',
    connected: 'Connected',
    disconnecting: 'Disconnecting...',
    reconnecting: 'Auto-reconnecting',
    connectionDropped: 'Connection dropped',
    connectBtn: 'CONNECT',
    disconnectBtn: 'DISCONNECT',
    cancelBtn: 'CANCEL',
    freeLabel: 'Free Unlimited',
    selectServer: 'Select Server Location',
    speedTest: 'Fast Internet Speed Check',
    checkSpeedNow: 'Check Speed',
    splitTunnel: 'Smart App Proxy',
    batteryFix: 'Battery Optimization Guide',
    protocol: 'Tunnel Protocol',
    download: 'Download',
    upload: 'Upload',
    duration: 'Session Time',
    virtualIp: 'Virtual IP',
    autoReconnect: 'Auto-Reconnect',
    lastServer: 'Last server',
    testDrop: 'Test Drop',
    retryNow: 'Retry now',
  },
  ur: {
    appName: 'SKP VPN',
    bannerText:
      'ڈس کنیکٹ ہونے کے مسائل حل کرنے کے لیے اینڈرائیڈ سیٹنگز سے بیٹری آپٹیمائزیشن بند کریں۔ آپ کی 5 اسٹار ★★★★★ ریٹنگ ہمارے لیے بہت اہم ہے!',
    bannerCta: 'سپورٹ کرنے کے لیے یہاں کلک کریں!',
    ready: 'کنیکٹ کرنے کے لیے تیار',
    connecting: 'کنیکٹ ہو رہا ہے...',
    connected: 'کنیکٹڈ (محفوظ)',
    disconnecting: 'منقطع ہو رہا ہے...',
    reconnecting: 'دوبارہ کنیکٹ ہو رہا ہے',
    connectionDropped: 'کنیکشن منقطع ہو گیا',
    connectBtn: 'CONNECT',
    disconnectBtn: 'DISCONNECT',
    cancelBtn: 'CANCEL',
    freeLabel: 'مفت اور لامحدود (Free)',
    selectServer: 'سرور لوکیشن منتخب کریں',
    speedTest: 'فاسٹ انٹرنیٹ سپیڈ چیک',
    checkSpeedNow: 'سپیڈ چیک کریں',
    splitTunnel: 'ایپ پراکسی فلٹر',
    batteryFix: 'بیٹری سیٹنگ گائیڈ',
    protocol: 'وی پی این پروٹوکول',
    download: 'ڈاؤن لوڈ',
    upload: 'اپ لوڈ',
    duration: 'دورانیہ',
    virtualIp: 'ورچوئل آئی پی',
    autoReconnect: 'آٹو ری کنیکٹ',
    lastServer: 'آخری سرور',
    testDrop: 'ڈراپ ٹیسٹ',
    retryNow: 'ابھی کوشش کریں',
  },
};
