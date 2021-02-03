import React from "react";
import "./App.css";
import {
  isErr,
  Document,
} from "earthstar";
import {
  AuthorLabel,
  Earthbar,
  EarthstarPeer,
  useCurrentAuthor,
  useCurrentWorkspace,
  useDocument,
  useDocuments,
  useStorages,
  useWorkspaces,
  useLocalStorageEarthstarSettings,
  LocalStorageSettingsWriter
} from "react-earthstar";
import { formatDistance, differenceInSeconds } from "date-fns";
import "react-earthstar/styles/layout.css";
import "react-earthstar/styles/junior.css";

function App() {
  const initValues = useLocalStorageEarthstarSettings('status')

  return (
    <div className="App">
      <EarthstarPeer
        {...initValues}
      >
        <div id={"earthbar-root"}>
          <Earthbar />
        </div>
        <LocalStorageSettingsWriter storageKey={'status'}/>
        <OnlineHeartbeatWriter />
        <div id={"app-root"}>
          <StatusPoster />
          <StatusesList />
        </div>
      </EarthstarPeer>
    </div>
  );
}

// this saves a heartbeat document every N seconds to know if you're online or not
function OnlineHeartbeatWriter() {
  const [storages] = useStorages();
  const [currentAuthor] = useCurrentAuthor();

  React.useEffect(() => {
    const interval = setInterval(() => {
      if (!currentAuthor) {
        return;
      }

      Object.values(storages).forEach((storage) => {
        storage.set(currentAuthor, {
          content: JSON.stringify(true),
          path: `/about/~${currentAuthor.address}/last-online.json`,
          format: "es.4",
        });
      });

      console.log("heartbeat", Date.now());
    }, 20000);

    return () => {
      clearInterval(interval);
    };
  }, [currentAuthor, storages]);

  return null;
}

// an input for writing your status.
// also has a dropdown to choose which workspace to save it in.
function StatusPoster() {
  const workspaces = useWorkspaces();

  const [newStatus, setNewStatus] = React.useState("");
  const [currentWorkspace] = useCurrentWorkspace();
  const [currentAuthor] = useCurrentAuthor();

  const [currentStatusDoc, setStatusDoc] = useDocument(
    `/about/~${currentAuthor?.address}/status.txt`,
    currentWorkspace || "oops"
  );
  
  const isNotSignedIn = currentAuthor === null;
  const hasNoWorkspaces = workspaces.length === 0;
  const isStartingFromZero = isNotSignedIn && hasNoWorkspaces;
  const needsHelp = isNotSignedIn || hasNoWorkspaces;

  return (
    <div>
      {workspaces.length > 0 && currentAuthor?.address ? (
        <form
          id={"message-poster"}
          onSubmit={(e) => {
            e.preventDefault();

            const result = setStatusDoc(newStatus);

            if (isErr(result)) {
              alert("Something went wrong!");
              return;
            }

            setNewStatus("");
          }}
        >
          <textarea
            id={"status-input"}
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            placeholder={currentStatusDoc?.content || "Enter a new status here"}
          />
          <button
            id={"status-submit"}
            type="submit"
            disabled={newStatus.length === 0}
          >
            {"💬"}
          </button>
        </form>
      ) : (
        null
      )}
      { needsHelp ? <div className={"helper"}>{isStartingFromZero ? "To get started, sign in and join or create a workspace." : isNotSignedIn ? "You need to be signed in to post!" : "Join or create a workspace to get started."}
      </div>: null}
    </div>
  );
}

// show all the statuses for all the workspaces
function StatusesList() {
  const [currentWorkspace] = useCurrentWorkspace();

  return currentWorkspace ? (
    <WorkspaceStatuses key={currentWorkspace} address={currentWorkspace} />
  ) : null;
}

// show all the statuses in one workspace
type WorkspaceStatusesProps = {
  address: string;
};

function WorkspaceStatuses({
  address: workspaceAddress,
}: WorkspaceStatusesProps) {
  const docs = useDocuments({ pathPrefix: "/about/" }, workspaceAddress)
    .filter((doc) => doc.path.endsWith("/status.txt"))
    .sort((aDoc, bDoc) => (aDoc.timestamp > bDoc.timestamp ? -1 : 1));

  return (
    <ul className={"status-list"}>
      {docs.map((doc) => (
        <Status key={doc.path} doc={doc} />
      ))}
    </ul>
  );
}

// compute an "oldness" css class for a date
type Oldness = "recent" | "old" | "ancient";
function howOld(date: Date): Oldness {
  const daysOld = (Date.now() - date.getTime()) / 1000 / 60 / 60 / 24;

  if (daysOld > 30) {
    return "ancient";
  }

  if (daysOld > 2) {
    return "old";
  }

  return "recent";
}

// show a single person's status
type StatusProps = {
  doc: Document;
};

function Status({ doc }: StatusProps) {
  const date = new Date(doc.timestamp / 1000);
  const agoString = formatDistance(date, new Date(), {
    addSuffix: true,
  });

  const oldness = howOld(date);

  // TODO: Actually make different styles for the different oldnesses

  const [displayNameDoc] = useDocument(
    `/about/~${doc.author}/displayName.txt`,
    doc.workspace
  );

  return (
    <li className={["status", oldness].join(" ")}>
      <p className={"status-text"}>{doc.content}</p>
      <p className={"status-author"}>
        <OnlineIndicator
          authorAddress={doc.author}
          workspaceAddress={doc.workspace}
        />
        <strong title={doc.author}>
          {displayNameDoc ? (
            displayNameDoc.content
          ) : (
            <AuthorLabel address={doc.author} />
          )}
        </strong>
      </p>
      <p className={"status-timestamp"}>
        {agoString}
      </p>
    </li>
  );
}

// an icon that shows if the person is recently online
type OnlineIndicatorProps = {
  authorAddress: string;
  workspaceAddress: string;
};

function OnlineIndicator({
  authorAddress,
  workspaceAddress,
}: OnlineIndicatorProps) {
  const [, setTickTock] = React.useState(false);
  const [lastOnlineDoc] = useDocument(
    `/about/~${authorAddress}/last-online.json`,
    workspaceAddress
  );

  React.useEffect(() => {
    const interval = setInterval(() => {
      setTickTock((prev) => !prev);
    }, 5000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  if (!lastOnlineDoc) {
    return <span title="unknown status" className={"status-dot status-unknown"}></span>;
  }

  const docDate = new Date(lastOnlineDoc.timestamp / 1000);

  const isOnline = differenceInSeconds(new Date(), docDate) <= 30;

  const notThere = lastOnlineDoc.content === "";

  return notThere ? null : isOnline ? (
    <span title="online" className={"status-dot status-online"}></span>
  ) : (
    <span title="offline" className={"status-dot status-offline"}></span>
  );
}

export default App;
