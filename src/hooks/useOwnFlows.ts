import { Flow } from '../types/data';
import { useLocalStorageState } from './useLocalStorageState';

export function useOwnFlows() {
  const [ownFlows, setOwnFlows] = useLocalStorageState<Flow[]>('ownFlows', []);

  const saveOwnFlow = (flow: Flow, originalName?: string) =>
    setOwnFlows([...ownFlows.filter(f => f.name !== (originalName ?? flow.name)), flow]);

  const deleteOwnFlow = (name: string) => setOwnFlows(ownFlows.filter(f => f.name !== name));

  return { ownFlows, saveOwnFlow, deleteOwnFlow };
}
