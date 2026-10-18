export interface OptionContractQuote {
  contractSymbol: string;
  strike: number;
  lastPrice: number;
  bid: number;
  ask: number;
  change: number;
  percentChange: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
  expiration: number;
}

export interface LiveOptionChainData {
  symbol: string;
  underlyingPrice: number;
  dividendYield: number;
  expirationDates: number[];
  selectedExpiration: number;
  calls: OptionContractQuote[];
  puts: OptionContractQuote[];
  isLive: boolean;
  dataSource: 'LIVE_EXCHANGE' | 'SIMULATED_MODEL';
}
