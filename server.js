import { createServer as createHttpServer } from "http";
import { createServer as createHttpsServer } from "https";
import { WebSocketServer } from "ws";
import { Clients } from "./clients.mjs";
import { environment, serverPort, certificate, privateKey } from "./config.mjs";

const clients = new Clients();

const server =
  environment === "prod"
    ? createHttpsServer({
        cert: certificate,
        key: privateKey,
      })
    : createHttpServer();

const wss = new WebSocketServer({ server });
wss.on("connection", function connection(ws) {
  ws.on("close", () => {
    if (ws.username) {
      clients.clientsList[ws.username].ws = clients.clientsList[
        ws.username
      ].ws.filter((_) => _.id !== ws.id);
    }

    clients.consoleLogStats();
  });

  ws.on("message", function message(data) {
    const event = JSON.parse(data);

    if (event.type === "register") {
      clients.registerUser(
        event.data.username,
        event.data.password,
        event.data.secret,
        ws
      );
    } else if (event.type === "login") {
      clients.loginUser(event.data.username, event.data.password, ws);
    } else if (event.type === "logout") {
      if (ws.username) {
        clients.clientsList[ws.username].ws = clients.clientsList[
          ws.username
        ].ws.filter((_) => _.id !== ws.id);
      }

      ws.send(
        JSON.stringify({
          type: "loggedout",
          data: {},
        })
      );
    } else {
      if (!event.data.token) {
        ws.send(
          JSON.stringify({
            type: "error",
            data: {
              error: "no-token",
              message: "Please login!",
            },
          })
        );

        return;
      } else {
        clients.saveClient(event.data.token, ws);
      }

      if (event.type === "create") {
        clients.add(event.data.token, event.data.task);
      } else if (event.type === "update") {
        clients.update(event.data.token, event.data.task);
      } else if (event.type === "delete") {
        clients.delete(event.data.token, event.data.task);
      } else if (event.type === "start") {
        clients.start(event.data.token, event.data.task);
      } else if (event.type === "complete") {
        clients.complete(event.data.token, event.data.task);
      } else if (event.type === "list") {
        clients.sendTaskList(event.data.token, ws);
      }
    }

    clients.consoleLogStats();
  });
});

server.listen(serverPort);
