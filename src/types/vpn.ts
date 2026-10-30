export enum ConnectionStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Disconnecting = 'disconnecting',
  Reconnecting = 'reconnecting',
}

export enum VpnProtocol {
  Auto = 'Auto (Recommended)',
  WireGuard = 'WireGuard UDP',
  IKEv2 = 'IKEv2 / IPsec',
  OpenVPNTcp = 'OpenVPN TCP (Port 443)',
}

export type Language = 'en' | 'ur';

export type ServerRegion = 'auto' | 'asia_me' | 'europe' | 'americas';

export interface ServerLocation {
  id: string;
  countryCode: string;
  region: ServerRegion;
  nameEn: string;
  nameUr: string;
  cityEn: string;
  cityUr: string;
  virtualIp: string;
  basePingMs: number;
  loadPercent: number;
}

export interface SplitTunnelApp {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
}

export interface SpeedTestMetrics {
  pingMs: number;
  loadedPingMs: number;
  downloadMbps: number;
  uploadMbps: number;
  jitterMs: number;
  timestamp: string;
}

export interface ReconnectLogEntry {
  id: string;
  serverNameEn: string;
  serverNameUr: string;
  reason: 'network_offline' | 'tunnel_drop';
  attempts: number;
  outcome: 'recovered' | 'failed';
  timestamp: string;
}

export interface NativeVpnEventPayload {
  state: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTING';
  detail?: string;
  error?: string;
  serverId?: string;
  serverName?: string;
  endpoint?: string;
  exitIp?: string;
  colo?: string;
  warpVerified?: boolean;
  rxBytes?: number;
  txBytes?: number;
  downMbps?: number;
  upMbps?: number;
  durationSec?: number;
  otaStatus?: 'idle' | 'downloading' | 'applied' | 'up_to_date';
  otaVersion?: string;
  installedBuild?: number;
}
