export class YouTubeApiError extends Error {
  status: number;
  code?: string;
  reason?: string;

  constructor(message: string, status: number, code?: string, reason?: string) {
    super(message);
    this.name = "YouTubeApiError";
    this.status = status;
    this.code = code;
    this.reason = reason;
  }
}