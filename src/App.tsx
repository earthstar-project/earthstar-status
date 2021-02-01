import React from "react";
import "./App.css";
import {
  isErr,
  Document,
  AuthorKeypair,
  StorageMemory,
  ValidatorEs4,
} from "earthstar";
import {
  AuthorLabel,
  AuthorTab,
  Earthbar,
  EarthstarPeer,
  MultiWorkspaceTab,
  Spacer,
  WorkspaceLabel,
  useCurrentAuthor,
  useCurrentWorkspace,
  useDocument,
  useDocuments,
  usePubs,
  useStorages,
  useSubscribeToStorages,
  useWorkspaces,
} from "react-earthstar";
import { formatDistance, differenceInSeconds } from "date-fns";
import "react-earthstar/styles/layout.css";
import "react-earthstar/styles/junior.css";

import { useLocalStorage, writeStorage } from "@rehooks/local-storage";

//================================================================================
// LOCALSTORAGE PERSISTENCE FOR REACT-EARTHSTAR

const LS_AUTHOR_KEY = "earthstar-status-currentAuthor";
const LS_PUBS_KEY = "earthstar-status-pubs";
const LS_STORAGES_DOCS_KEY = "earthstar-status-storages-docs";
const LS_CURRENT_WORKSPACE_KEY = "earthstar-status-current-workspace";

// This is a deeply nested object with keys like:
//   workspaceAddress:
//      path:
//        author:
//            Document
type WorkspaceRecords = Record<
  string,
  Record<string, Record<string, Document>>
>;
// workspaceAddress -> list of pub URLs
type PubRecords = Record<string, string[]>;

// this saves the state of react-earthstar to localStorage
function Persistor() {
  const [storages] = useStorages();
  const [pubs] = usePubs();
  const [currentAuthor] = useCurrentAuthor();
  const [currentWorkspace] = useCurrentWorkspace();

  useSubscribeToStorages({
    onWrite: (event) => {
      const storage = storages[event.document.workspace];
      writeStorage(LS_STORAGES_DOCS_KEY, {
        ...storages,
        [event.document.workspace]: (storage as StorageMemory)._docs,
      });
    },
  });

  React.useEffect(() => {
    Object.values(storages).forEach((storage) => {
      writeStorage(LS_STORAGES_DOCS_KEY, {
        ...storages,
        [storage.workspace]: (storage as StorageMemory)._docs,
      });
    });
  }, [storages]);

  React.useEffect(() => {
    writeStorage(LS_PUBS_KEY, pubs);
  }, [pubs]);

  React.useEffect(() => {
    writeStorage(LS_AUTHOR_KEY, currentAuthor);
  }, [currentAuthor]);

  React.useEffect(() => {
    writeStorage(LS_CURRENT_WORKSPACE_KEY, currentWorkspace);
  }, [currentWorkspace]);

  return null;
}

//================================================================================
// MAIN APP COMPONENT

function App() {
  // load the initial state from localStorage
  const [workspacesDocsInStorage] = useLocalStorage<WorkspaceRecords>(
    LS_STORAGES_DOCS_KEY,
    {}
  );
  const [pubsInStorage] = useLocalStorage<PubRecords>(LS_PUBS_KEY, {});
  const [currentAuthorInStorage] = useLocalStorage<AuthorKeypair>(
    LS_AUTHOR_KEY
  );
  const [currentWorkspaceInStorage] = useLocalStorage(LS_CURRENT_WORKSPACE_KEY);

  const initWorkspaces = Object.entries(workspacesDocsInStorage).map(
    ([workspaceAddress, docs]) => {
      const storage = new StorageMemory([ValidatorEs4], workspaceAddress);
      // (this is a hack that knows too much about the internal structure of StorageMemory)
      // (it would be better to ingest each document one by one, but also a lot slower)
      storage._docs = docs;
      return storage;
    }
  );

  return (
    <div className="App">
      <EarthstarPeer
        initPubs={pubsInStorage}
        initWorkspaces={initWorkspaces}
        initCurrentAuthor={currentAuthorInStorage}
        initCurrentWorkspace={currentWorkspaceInStorage}
      >
        <div id={"earthbar-root"}>
          <Earthbar />
        </div>
        <Persistor />

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

  return (
    <div>
      {currentAuthor === null ? "Sign in to post!" : null}
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
        "Add some workspaces so that you can post!"
      )}
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
        <strong>
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
    return null;
  }

  const docDate = new Date(lastOnlineDoc.timestamp / 1000);

  const isOnline = differenceInSeconds(new Date(), docDate) <= 30;

  const notThere = lastOnlineDoc.content === "";

  return notThere ? null : isOnline ? (
    <span className={"status-dot online"}></span>
  ) : (
    <span className={"status-dot offline"}></span>
  );
}

export default App;
