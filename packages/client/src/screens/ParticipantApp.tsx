import { useParams } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp';

export { plainScreenClass } from './WorkspaceApp';

/** Participant route `/s/:token`: the workspace the link belongs to. */
export function ParticipantApp() {
  const { token = '' } = useParams();
  return <WorkspaceApp token={token} />;
}
