import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { WebSocketServer } from "ws";
import { Clients } from "./clients.mjs";
import { environment, serverPort, certificate, privateKey } from "./config.mjs";
import { v4 as uuid } from "uuid";

const clients = new Clients();

const server =
  environment === "prod"
    ? createHttpsServer({
        cert: certificate,
        key: privateKey,
      })
    : createHttpServer();

const wss = new WebSocketServer({ server });

const handleClose = (ws, code, reason) => {
  console.log({
    status: "closed",
    id: ws.id,
    code,
    reason,
  });

  clients.removeClient(ws);
  clients.consoleLogStats();
};

const handleError = (ws, error) => {
  console.log({
    status: "error",
    id: ws.id,
    error,
  });

  clients.removeClient(ws);
  clients.consoleLogStats();
};

const parseMessage = (message) => {
  if (typeof message === "string") {
    try {
      message = JSON.parse(message);

      return message;
    } catch {
      return {
        type: message,
        data: {},
      };
    }
  }

  return null;
};

const handlePing = (ws) => {
  ws.send("pong");
};

const handleRegistration = (ws, event) => {
  clients.registerUser(
    event.data.username,
    event.data.password,
    event.data.secret,
    ws
  );

  clients.consoleLogStats();
};

const handleLogin = (ws, event) => {
  clients.loginUser(event.data.username, event.data.password, ws);

  clients.consoleLogStats();
};

const handleLogout = (ws) => {
  clients.removeClient(ws);

  ws.send(
    JSON.stringify({
      type: "loggedout",
      data: {},
    })
  );

  clients.consoleLogStats();
};

const checkAuth = (ws, event) => {
  if (!event?.data?.token) {
    ws.send(
      JSON.stringify({
        type: "error",
        data: {
          error: "unauthorized",
          message: "Unauthorized",
        },
      })
    );

    clients.removeClient(ws);
    clients.consoleLogStats();

    return false;
  }

  clients.saveClient(event.data.token, ws);

  return true;
};

const eventsMap = {
  ping: handlePing,
  register: handleRegistration,
  login: handleLogin,
  logout: handleLogout,
  list: (ws, event) => {
    if (!checkAuth(ws, event)) return;

    clients.sendTaskList(event.data.token, ws);
  },
  create: (ws, event) => {
    if (!checkAuth(ws, event)) return;

    clients.add(event.data.token, event.data.task);

    clients.consoleLogStats();
  },
  updatePriority: (ws, event) => {
    if (!checkAuth(ws, event)) return;

    clients.updatePriority(event.data.token, event.data.task);

    clients.consoleLogStats();
  },
  updateName: (ws, event) => {
    if (!checkAuth(ws, event)) return;

    clients.updateName(event.data.token, event.data.task);

    clients.consoleLogStats();
  },
  delete: (ws, event) => {
    if (!checkAuth(ws, event)) return;

    clients.delete(event.data.token, event.data.task);

    clients.consoleLogStats();
  },
  start: (ws, event) => {
    if (!checkAuth(ws, event)) return;

    clients.start(event.data.token, event.data.task);
  },
  pause: (ws, event) => {
    if (!checkAuth(ws, event)) return;

    clients.pause(event.data.token, event.data.task);
  },
  resume: (ws, event) => {
    if (!checkAuth(ws, event)) return;

    clients.resume(event.data.token, event.data.task);
  },
  restart: (ws, event) => {
    if (!checkAuth(ws, event)) return;

    clients.restart(event.data.token, event.data.task);
  },
  complete: (ws, event) => {
    if (!checkAuth(ws, event)) return;

    clients.complete(event.data.token, event.data.task);
  },
  copy: (ws, event) => {
    if (!checkAuth(ws, event)) return;

    clients.copy(event.data.token, event.data.task);
  },
};

const handleMessage = (ws, data) => {
  const event = parseMessage(data.toString());

  console.log({
    status: "message",
    id: ws.id,
    event,
  });

  if (event?.type && typeof eventsMap[event.type] === "function") {
    eventsMap[event.type](ws, event);
  } else {
    ws.send(
      JSON.stringify({
        type: "error",
        data: {
          error: "payload",
          message: "Unsuported payload",
          payload: event,
        },
      })
    );
  }
};

wss.on("connection", function connection(ws) {
  ws = clients.prepareClient(ws);

  console.log({
    status: `connected`,
    id: ws.id,
  });

  ws.on("error", (error) => {
    handleError(ws, error);
  });

  ws.on("close", (code, reason) => {
    handleClose(ws, code, reason);
  });

  ws.on("message", (message) => {
    handleMessage(ws, message);
  });
});

server.listen(serverPort);
