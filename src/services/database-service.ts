import mongoose from "mongoose";
import { maskMongoUri } from "../../shared/connection/database";

export interface IDatabaseService {
  connect(uri: string): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}

export class DatabaseService implements IDatabaseService {
  async connect(uri: string): Promise<void> {
    // Password redacted — this runs on cronserver boot and pm2 persists the log.
    console.log("Connect", maskMongoUri(uri));
    await mongoose.connect(uri);
  }

  async disconnect(): Promise<void> {
    await mongoose.disconnect();
  }

  isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }
}
