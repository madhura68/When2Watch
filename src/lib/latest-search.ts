export class LatestSearch<T> {
  private version = 0;
  private controller?: AbortController;
  constructor(private readonly request: (query: string, signal: AbortSignal) => Promise<T>) {}
  cancel() { this.version++; this.controller?.abort(); }
  async find(query: string, success: (value: T) => void, failure: (error: unknown) => void): Promise<void> {
    this.cancel();
    if (!query.trim()) return;
    const version = this.version, controller = this.controller = new AbortController();
    try { const value = await this.request(query.trim(), controller.signal); if (version === this.version) success(value); }
    catch (error) { if (version === this.version) failure(error); }
  }
}
