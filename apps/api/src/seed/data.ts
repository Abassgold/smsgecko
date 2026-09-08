/** Curated catalog seed data. Order roughly matches the live site's chips. */

export interface ServiceSeed {
  slug: string;
  name: string;
  iconKey: string;
  aliases?: string[];
  popular?: boolean;
}

export const SERVICES: ServiceSeed[] = [
  { slug: 'whatsapp', name: 'WhatsApp', iconKey: 'whatsapp', popular: true },
  { slug: 'telegram', name: 'Telegram', iconKey: 'telegram', popular: true },
  { slug: 'instagram', name: 'Instagram / Threads', iconKey: 'instagram', aliases: ['threads'], popular: true },
  { slug: 'tiktok', name: 'TikTok / Douyin', iconKey: 'tiktok', aliases: ['douyin'], popular: true },
  { slug: 'facebook', name: 'Facebook', iconKey: 'facebook', popular: true },
  { slug: 'google', name: 'Google / YouTube / Gmail', iconKey: 'google', aliases: ['youtube', 'gmail'], popular: true },
  { slug: 'twitter', name: 'Twitter / X', iconKey: 'twitter', aliases: ['x'], popular: true },
  { slug: 'discord', name: 'Discord', iconKey: 'discord', popular: true },
  { slug: 'openai', name: 'OpenAI (ChatGPT)', iconKey: 'openai', aliases: ['chatgpt'], popular: true },
  { slug: 'apple', name: 'Apple', iconKey: 'apple' },
  { slug: 'microsoft', name: 'Microsoft', iconKey: 'microsoft' },
  { slug: 'amazon', name: 'Amazon', iconKey: 'amazon' },
  { slug: 'netflix', name: 'Netflix', iconKey: 'netflix' },
  { slug: 'spotify', name: 'Spotify', iconKey: 'spotify' },
  { slug: 'snapchat', name: 'Snapchat', iconKey: 'snapchat' },
  { slug: 'tinder', name: 'Tinder', iconKey: 'tinder' },
  { slug: 'paypal', name: 'PayPal', iconKey: 'paypal' },
  { slug: 'uber', name: 'Uber', iconKey: 'uber' },
  { slug: 'linkedin', name: 'LinkedIn', iconKey: 'linkedin' },
  { slug: 'wechat', name: 'WeChat', iconKey: 'wechat' },
  { slug: 'shopee', name: 'Shopee', iconKey: 'shopee' },
  { slug: 'line', name: 'LINE', iconKey: 'line' },
  { slug: 'viber', name: 'Viber', iconKey: 'viber' },
  { slug: 'signal', name: 'Signal', iconKey: 'signal' },
  { slug: 'grab', name: 'Grab', iconKey: 'grab' },
  { slug: 'gojek', name: 'Gojek', iconKey: 'gojek' },
  { slug: 'lazada', name: 'Lazada', iconKey: 'lazada' },
  { slug: 'tokopedia', name: 'Tokopedia', iconKey: 'tokopedia' },
  { slug: 'steam', name: 'Steam', iconKey: 'steam' },
  { slug: 'roblox', name: 'Roblox', iconKey: 'roblox' },
  { slug: 'binance', name: 'Binance', iconKey: 'binance' },
  { slug: 'coinbase', name: 'Coinbase', iconKey: 'coinbase' },
  { slug: 'aliexpress', name: 'AliExpress', iconKey: 'aliexpress' },
  { slug: 'temu', name: 'Temu', iconKey: 'temu' },
  { slug: 'airbnb', name: 'Airbnb', iconKey: 'airbnb' },
  { slug: 'kakaotalk', name: 'KakaoTalk', iconKey: 'kakaotalk' },
  { slug: 'bumble', name: 'Bumble', iconKey: 'bumble' },
  { slug: 'twitch', name: 'Twitch', iconKey: 'twitch' },
  { slug: 'revolut', name: 'Revolut', iconKey: 'revolut' },
  { slug: 'wise', name: 'Wise', iconKey: 'wise' },
];

export interface CountrySeed {
  code: string;
  name: string;
  dialCode: string;
  flagEmoji: string;
}

export const COUNTRIES: CountrySeed[] = [
  { code: 'id', name: 'Indonesia', dialCode: '62', flagEmoji: '🇮🇩' },
  { code: 'in', name: 'India', dialCode: '91', flagEmoji: '🇮🇳' },
  { code: 'us', name: 'USA', dialCode: '1', flagEmoji: '🇺🇸' },
  { code: 'gb', name: 'United Kingdom', dialCode: '44', flagEmoji: '🇬🇧' },
  { code: 'ph', name: 'Philippines', dialCode: '63', flagEmoji: '🇵🇭' },
  { code: 'br', name: 'Brazil', dialCode: '55', flagEmoji: '🇧🇷' },
  { code: 'vn', name: 'Vietnam', dialCode: '84', flagEmoji: '🇻🇳' },
  { code: 'my', name: 'Malaysia', dialCode: '60', flagEmoji: '🇲🇾' },
  { code: 'th', name: 'Thailand', dialCode: '66', flagEmoji: '🇹🇭' },
  { code: 'cn', name: 'China', dialCode: '86', flagEmoji: '🇨🇳' },
  { code: 'ua', name: 'Ukraine', dialCode: '380', flagEmoji: '🇺🇦' },
  { code: 'mm', name: 'Myanmar', dialCode: '95', flagEmoji: '🇲🇲' },
  { code: 'kz', name: 'Kazakhstan', dialCode: '7', flagEmoji: '🇰🇿' },
  { code: 'ng', name: 'Nigeria', dialCode: '234', flagEmoji: '🇳🇬' },
  { code: 'bd', name: 'Bangladesh', dialCode: '880', flagEmoji: '🇧🇩' },
  { code: 'tr', name: 'Türkiye', dialCode: '90', flagEmoji: '🇹🇷' },
  { code: 'mx', name: 'Mexico', dialCode: '52', flagEmoji: '🇲🇽' },
  { code: 'eg', name: 'Egypt', dialCode: '20', flagEmoji: '🇪🇬' },
  { code: 'pk', name: 'Pakistan', dialCode: '92', flagEmoji: '🇵🇰' },
  { code: 'co', name: 'Colombia', dialCode: '57', flagEmoji: '🇨🇴' },
  { code: 'za', name: 'South Africa', dialCode: '27', flagEmoji: '🇿🇦' },
  { code: 'ke', name: 'Kenya', dialCode: '254', flagEmoji: '🇰🇪' },
  { code: 'tz', name: 'Tanzania', dialCode: '255', flagEmoji: '🇹🇿' },
  { code: 'kh', name: 'Cambodia', dialCode: '855', flagEmoji: '🇰🇭' },
  { code: 'kg', name: 'Kyrgyzstan', dialCode: '996', flagEmoji: '🇰🇬' },
  { code: 'uz', name: 'Uzbekistan', dialCode: '998', flagEmoji: '🇺🇿' },
  { code: 'il', name: 'Israel', dialCode: '972', flagEmoji: '🇮🇱' },
  { code: 'hk', name: 'Hong Kong', dialCode: '852', flagEmoji: '🇭🇰' },
  { code: 'pl', name: 'Poland', dialCode: '48', flagEmoji: '🇵🇱' },
  { code: 'de', name: 'Germany', dialCode: '49', flagEmoji: '🇩🇪' },
  { code: 'nl', name: 'Netherlands', dialCode: '31', flagEmoji: '🇳🇱' },
  { code: 'ca', name: 'Canada', dialCode: '1', flagEmoji: '🇨🇦' },
  { code: 'ar', name: 'Argentina', dialCode: '54', flagEmoji: '🇦🇷' },
  { code: 'sa', name: 'Saudi Arabia', dialCode: '966', flagEmoji: '🇸🇦' },
  { code: 'ae', name: 'United Arab Emirates', dialCode: '971', flagEmoji: '🇦🇪' },
  { code: 'ro', name: 'Romania', dialCode: '40', flagEmoji: '🇷🇴' },
  { code: 'pe', name: 'Peru', dialCode: '51', flagEmoji: '🇵🇪' },
  { code: 'tw', name: 'Taiwan', dialCode: '886', flagEmoji: '🇹🇼' },
  { code: 'es', name: 'Spain', dialCode: '34', flagEmoji: '🇪🇸' },
  { code: 'fr', name: 'France', dialCode: '33', flagEmoji: '🇫🇷' },
];
