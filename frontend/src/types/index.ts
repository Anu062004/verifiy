export interface PipelineRecord {
  id: number;
  storageRootHash: string;
  photoCommitment: string;
  matchedUrlCommitment: string;
  submitter: string;
  timestamp: number;
  status: "pending" | "verified" | "failed" | "processing";
  faceStatus: "match" | "nomatch" | "unavailable";
  url: string | null;
}

export interface RunResult {
  runId: string;
  status: string;
  faceStatus: string;
  chainRecordId: number | null;
  readbackVerified: boolean;
  createdAt: string;
  commitments: {
    storageRootHash: string;
    photoCommitment: string;
    matchedUrlCommitment: string;
  };
}

export interface VerificationRecord {
  storageRootHash: string;
  photoCommitment: string;
  matchedUrlCommitment: string;
  submitter: string;
  timestamp: number;
  humanConfirmation: {
    confirmed: boolean;
    subjectConsentAttested: boolean;
  };
}
