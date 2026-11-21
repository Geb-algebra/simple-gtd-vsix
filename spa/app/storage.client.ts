import localforage from "localforage";
import { applyOperation, localDay, sampleState, stateSchema, type Operation } from "./tasks";

const storage = localforage.createInstance({ name: "simple-gtd" });
const key = "workspace-v1";
let pending: Promise<unknown> = Promise.resolve();

function transaction<T>(work: () => Promise<T>) {
  const run = () => (navigator.locks ? navigator.locks.request(key, work) : work());
  const result = pending.then(run);
  pending = result.catch(() => undefined);
  return result;
}

async function readState() {
  const data = await storage.getItem(key);
  if (data !== null) return stateSchema.parse(data);
  return storage.setItem(key, sampleState(localDay()));
}

export function loadWorkspace() {
  return transaction(readState);
}

export function changeWorkspace(operation: Operation) {
  return transaction(async () => {
    const state = await readState();
    const result = applyOperation(state, operation, localDay(), () => crypto.randomUUID());
    if (result.state !== state) await storage.setItem(key, result.state);
    return result.motion;
  });
}
