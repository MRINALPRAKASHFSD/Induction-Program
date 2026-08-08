export class GeofenceError extends Error {
  code: string;
  distance?: number;
  accuracy?: number;

  constructor(message: string, code: string, distance?: number, accuracy?: number) {
    super(message);
    this.name = 'GeofenceError';
    this.code = code;
    this.distance = distance;
    this.accuracy = accuracy;
  }
}
