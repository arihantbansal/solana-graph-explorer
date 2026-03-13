import type { Node, Edge } from "@xyflow/react";
import type { RelationshipType, PdaRelationshipRule } from "./relationships";

export interface AccountNodeData {
  address: string;
  accountType?: string;
  programId?: string;
  programName?: string;
  balance?: number; // in lamports
  isExpanded: boolean;
  isLoading: boolean;
  decodedData?: Record<string, unknown>;
  error?: string;
  thumbnail?: string; // NFT image URL

  [key: string]: unknown;
}

export type AccountNode = Node<AccountNodeData, "account">;

export interface AccountEdgeData {
  relationshipType: RelationshipType;
  label: string;
  fieldName?: string;
  ruleId?: string;
  pdaRule?: PdaRelationshipRule;
  [key: string]: unknown;
}

export type AccountEdge = Edge<AccountEdgeData>;

export interface GraphState {
  nodes: AccountNode[];
  edges: AccountEdge[];
  selectedNodeId: string | null;
}

export type GraphAction =
  | { type: "ADD_NODES"; nodes: AccountNode[] }
  | { type: "ADD_EDGES"; edges: AccountEdge[] }
  | { type: "SET_NODE_DATA"; nodeId: string; data: Partial<AccountNodeData> }
  | { type: "SELECT_NODE"; nodeId: string | null }
  | { type: "REMOVE_NODE"; nodeId: string }
  | { type: "COLLAPSE_CHILDREN"; nodeId: string }
  | { type: "CLEAR" }
  | { type: "SET_NODES"; nodes: AccountNode[] }
  | { type: "SET_EDGES"; edges: AccountEdge[] };
