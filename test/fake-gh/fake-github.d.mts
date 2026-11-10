import type { Runner } from "../../src/lib/exec.ts";

export interface FakeLabel {
  name: string;
  color: string;
  description: string;
}

export interface FakeRepo {
  visibility: string;
  defaultBranch: string;
  hasWikiEnabled: boolean;
  wikiInitialized: boolean;
  isEmpty: boolean;
  labels: FakeLabel[];
  rulesets: Record<string, unknown>[];
  reactions: { issue: number; content: string }[];
  issues: Record<string, unknown>[];
  pulls: Record<string, unknown>[];
  threads: Record<
    string,
    {
      issue: Record<string, unknown>;
      comments?: Record<string, unknown>[];
      reviews?: Record<string, unknown>[];
      reviewComments?: Record<string, unknown>[];
    }
  >;
  runLogs: Record<string, string>;
}

export interface FakeState {
  login: string;
  authenticated: boolean;
  scopes: string[] | null;
  repos: Record<string, FakeRepo>;
  orgDotGithub: Record<string, string[]>;
  failures: { match: string; stderr: string; times: number }[];
  nextId: number;
  calls: string[][];
}

export function newState(overrides?: Partial<FakeState>): FakeState;
export function newRepo(overrides?: Partial<FakeRepo>): FakeRepo;
export function handle(
  state: FakeState,
  args: string[],
  opts?: { input?: string; cwd?: string },
): { code: number; stdout: string; stderr: string };
export function fakeGithubRunner(state: FakeState, realRunner: Runner): Runner;
