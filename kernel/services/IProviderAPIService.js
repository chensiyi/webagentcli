export class IProviderAPIService {
  constructor() {}
  async chat(request, onChunk) { throw new Error('Not implemented'); }
  async chatStream(request, onChunk) { throw new Error('Not implemented'); }
  cancel() {}
}
export default IProviderAPIService;