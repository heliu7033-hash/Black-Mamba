import { EditorWorkspaceView } from './editor/EditorWorkspaceView';
import { useEditorController, type EditorProps } from './editor/useEditorController';
import { LaosaProvider } from './laosa/LaosaContext';

export default function Editor(props: EditorProps) {
  const workspace = useEditorController(props);
  return (
    <LaosaProvider
      key={props.project.id}
      projectId={props.project.id}
      state={workspace.timeline.state}
      playerRef={workspace.timeline.playerRef}
      onOpenSettings={workspace.chatPanel.onOpenSettings}
    >
      <EditorWorkspaceView {...workspace} />
    </LaosaProvider>
  );
}
