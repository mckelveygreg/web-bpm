export interface BpmDataPoint {
  timestamp: number;
  bpm: number | null;
  confidence: number;
}

export interface Session {
  id: string;
  name: string;
  venue: string;
  genre: string;
  notes: string;
  createdAt: Date;
  duration: number;
  targetBpm: number | null;
  bpmTimeSeries: BpmDataPoint[];
  audioBlob?: Blob;
  starred?: boolean;
}
