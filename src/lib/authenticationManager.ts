export interface ApiAuthConfig {
  id?: string;
  name: string;
  loginEndpoint: string;
  pingEndpoint: string;
  tokenFieldName?: string;
  username: string;
  password: string;
  isActive: boolean;
}

interface AuthState {
  token: string | null;
  username: string;
  password: string;
  loginEndpoint: string;
  pingEndpoint: string;
  tokenFieldName: string;
  lastPingTime: number;
}

const PING_THROTTLE_MS = 30000;

export class AuthenticationManager {
  private static instance: AuthenticationManager | null = null;
  private configs: Map<string, AuthState> = new Map();
  private pendingTokenPromises: Map<string, Promise<string>> = new Map();
  private defaultConfigName: string | null = null;

  private constructor() {}

  public static getInstance(): AuthenticationManager {
    if (!AuthenticationManager.instance) {
      AuthenticationManager.instance = new AuthenticationManager();
    }
    return AuthenticationManager.instance;
  }

  public static resetInstance(): void {
    AuthenticationManager.instance = null;
  }

  public initialize(config: ApiAuthConfig): void {
    const state: AuthState = {
      username: config.username,
      password: config.password,
      loginEndpoint: config.loginEndpoint,
      pingEndpoint: config.pingEndpoint,
      tokenFieldName: config.tokenFieldName || 'access_token',
      token: null,
      lastPingTime: 0
    };

    this.configs.set(config.name, state);

    if (!this.defaultConfigName) {
      this.defaultConfigName = config.name;
    }
  }

  public initializeMultiple(configs: ApiAuthConfig[]): void {
    configs.forEach(config => this.initialize(config));
  }

  public setDefaultConfig(name: string): void {
    if (this.configs.has(name)) {
      this.defaultConfigName = name;
    }
  }

  public getConfigNames(): string[] {
    return Array.from(this.configs.keys());
  }

  public hasConfig(name: string): boolean {
    return this.configs.has(name);
  }

  public removeConfig(name: string): void {
    this.configs.delete(name);
    this.pendingTokenPromises.delete(name);
    if (this.defaultConfigName === name) {
      const remaining = Array.from(this.configs.keys());
      this.defaultConfigName = remaining.length > 0 ? remaining[0] : null;
    }
  }

  public isInitialized(configName?: string): boolean {
    const name = configName || this.defaultConfigName;
    if (!name) return false;

    const state = this.configs.get(name);
    if (!state) return false;

    return state.loginEndpoint !== '' &&
           state.username !== '' &&
           state.password !== '';
  }

  public async getToken(configName?: string): Promise<string> {
    const name = configName || this.defaultConfigName;
    if (!name) {
      throw new Error('No authentication configuration specified and no default set.');
    }

    if (!this.isInitialized(name)) {
      throw new Error(`AuthenticationManager not initialized for config "${name}". Call initialize() with valid config first.`);
    }

    const existingPromise = this.pendingTokenPromises.get(name);
    if (existingPromise) {
      return existingPromise;
    }

    const tokenPromise = this.resolveToken(name);
    this.pendingTokenPromises.set(name, tokenPromise);

    try {
      const token = await tokenPromise;
      return token;
    } finally {
      this.pendingTokenPromises.delete(name);
    }
  }

  private async resolveToken(configName: string): Promise<string> {
    const state = this.configs.get(configName);
    if (!state) {
      throw new Error(`Config "${configName}" not found`);
    }

    if (!state.token) {
      return this.performLogin(configName);
    }

    const now = Date.now();
    if (now - state.lastPingTime < PING_THROTTLE_MS) {
      return state.token;
    }

    const isValid = await this.pingToken(configName);
    if (isValid) {
      state.lastPingTime = now;
      return state.token!;
    }

    return this.performLogin(configName);
  }

  private async pingToken(configName: string): Promise<boolean> {
    const state = this.configs.get(configName);
    if (!state || !state.pingEndpoint || !state.token) {
      return false;
    }

    try {
      const response = await fetch(state.pingEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${state.token}`,
          'Content-Type': 'application/json'
        }
      });

      return response.status === 204 || response.ok;
    } catch (error) {
      console.warn(`Ping request failed for "${configName}":`, error);
      return false;
    }
  }

  private async performLogin(configName: string): Promise<string> {
    const state = this.configs.get(configName);
    if (!state) {
      throw new Error(`Config "${configName}" not found`);
    }

    try {
      const response = await fetch(state.loginEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: state.username,
          password: state.password
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Login failed for "${configName}": ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
      }

      const data = await response.json();
      const tokenFieldName = state.tokenFieldName;

      if (!data[tokenFieldName]) {
        throw new Error(`Login response missing '${tokenFieldName}' field for "${configName}"`);
      }

      state.token = data[tokenFieldName];
      state.lastPingTime = Date.now();

      return state.token;
    } catch (error) {
      state.token = null;
      state.lastPingTime = 0;
      throw error;
    }
  }

  public clearToken(configName?: string): void {
    if (configName) {
      const state = this.configs.get(configName);
      if (state) {
        state.token = null;
        state.lastPingTime = 0;
      }
    } else {
      this.configs.forEach(state => {
        state.token = null;
        state.lastPingTime = 0;
      });
    }
  }

  public getConfig(configName?: string): Omit<ApiAuthConfig, 'id'> | null {
    const name = configName || this.defaultConfigName;
    if (!name) return null;

    const state = this.configs.get(name);
    if (!state) return null;

    return {
      name: name,
      loginEndpoint: state.loginEndpoint,
      pingEndpoint: state.pingEndpoint,
      tokenFieldName: state.tokenFieldName,
      username: state.username,
      password: state.password,
      isActive: true
    };
  }

  public hasToken(configName?: string): boolean {
    const name = configName || this.defaultConfigName;
    if (!name) return false;

    const state = this.configs.get(name);
    return state?.token !== null;
  }
}

export const AuthManager = AuthenticationManager.getInstance();
