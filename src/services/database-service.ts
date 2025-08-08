import mongoose from "mongoose";

export interface IDatabaseService {
  connect(uri: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

export class DatabaseService implements IDatabaseService {
  async connect(uri: string): Promise<void> {
    console.log("Connect", uri);
    await mongoose.connect(uri);
  }

  async disconnect(): Promise<void> {
    await mongoose.disconnect();
  }

  isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }
}
