import { WebSocketServer } from "ws";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuid } from "uuid";
import crypto from "crypto";
import * as dotenv from "dotenv"; // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config();

const registrationSecrets = process.env.registration_secrets.split("|");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Clients {
  constructor() {
    this.clientsList = {};
    this.saveClient = this.saveClient.bind(this);
  }

  resolveDatabaseUsersPath() {
    return path.resolve(__dirname, `./database/users`);
  }

  resolveDatabaseUserPath(username) {
    return path.resolve(`${this.resolveDatabaseUsersPath()}/${username}`);
  }

  resolveDatabaseTaskPath(username, taskId) {
    return path.resolve(
      `${path.resolve(
        this.resolveDatabaseUserPath(username)
      )}/task_${taskId}.json`
    );
  }

  saveClient(username, client) {
    if (client.id && client.username) return;

    client.id = uuid();
    client.username = username;

    if (!this.clientsList[username]) {
      if (!fs.existsSync(this.resolveDatabaseUserPath(username))) {
        fs.mkdirSync(this.resolveDatabaseUserPath(username));
      }

      this.clientsList[username] = {
        ws: [client],
      };
    } else {
      this.clientsList[username].ws.push(client);
    }
  }

  generateHash(username, password) {
    // create a hash object with the SHA256 algorithm
    const hash = crypto.createHash("sha256");

    // update the hash object with the username and password pair
    hash.update(username + password);

    // generate the hashed value as a hexadecimal string
    const hashedValue = hash.digest("hex");

    return hashedValue;
  }

  registerUser(username, password, secret, client) {
    console.log(secret);
    if (registrationSecrets.includes(secret)) {
      const hash = this.generateHash(username, password);
      this.saveClient(hash, client);

      client.send(
        JSON.stringify({
          type: "registered",
          data: {
            token: hash,
          },
        })
      );
    } else {
      client.send(
        JSON.stringify({
          type: "error",
          data: {
            message: "Wrong secret provided!",
          },
        })
      );

      client.close();
    }
  }

  loginUser(username, password, client) {
    const hash = this.generateHash(username, password);

    if (fs.existsSync(this.resolveDatabaseUserPath(hash))) {
      this.saveClient(hash, client);

      client.send(
        JSON.stringify({
          type: "loggedin",
          data: {
            token: hash,
          },
        })
      );
    } else {
      client.send(
        JSON.stringify({
          type: "error",
          data: {
            message: "Wrong credentials!",
          },
        })
      );

      client.close();
    }
  }

  sendTaskList(username, client) {
    const files = fs.readdirSync(this.resolveDatabaseUserPath(username));

    const tasks = [];
    files.forEach((f) => {
      const task = JSON.parse(
        fs.readFileSync(
          `${this.resolveDatabaseUserPath(username)}/${f}`,
          "utf-8"
        )
      );

      if (task?.id) {
        tasks.push(task);
      }
    });

    client.send(
      JSON.stringify({
        type: "list",
        data: { tasks },
      })
    );
  }

  add(username, targetTask, autostart) {
    const task = {
      id: uuid(),
      name: targetTask.name,
      project: targetTask?.project,
      created_at: new Date().getTime(),
      started_at: autostart ? new Date().getTime() : 0,
      current_at: 0,
      completed_at: 0,
    };

    fs.writeFileSync(
      this.resolveDatabaseTaskPath(username, task.id),
      JSON.stringify(task)
    );

    this.clientsList[username].ws.forEach((c) => {
      c.send(
        JSON.stringify({
          type: "created",
          data: {
            task,
          },
        })
      );
    });
  }

  update(username, targetTask) {
    fs.writeFileSync(
      this.resolveDatabaseTaskPath(username, targetTask.id),
      JSON.stringify(targetTask)
    );

    this.clientsList[username].ws.forEach((c) => {
      c.send(
        JSON.stringify({
          type: "updated",
          data: {
            task: targetTask,
          },
        })
      );
    });
  }

  delete(username, targetTask) {
    fs.unlinkSync(this.resolveDatabaseTaskPath(username, targetTask.id));

    this.clientsList[username].ws.forEach((c) => {
      c.send(
        JSON.stringify({
          type: "deleted",
          data: {
            task: targetTask,
          },
        })
      );
    });
  }

  start(username, targetTask) {
    if (targetTask.completed_at) {
      this.add(username, targetTask, true);

      return;
    }

    const task = JSON.parse(
      fs.readFileSync(
        this.resolveDatabaseTaskPath(username, targetTask.id),
        "utf-8"
      )
    );

    if (task.started_at) {
      return;
    }

    task.started_at = new Date().getTime();

    fs.writeFileSync(
      this.resolveDatabaseTaskPath(username, targetTask.id),
      JSON.stringify(task)
    );

    this.clientsList[username].ws.forEach((c) => {
      c.send(
        JSON.stringify({
          type: "updated",
          data: {
            task,
          },
        })
      );
    });
  }

  complete(username, targetTask) {
    const task = JSON.parse(
      fs.readFileSync(
        this.resolveDatabaseTaskPath(username, targetTask.id),
        "utf-8"
      )
    );

    if (task.completed_at) {
      return;
    }

    task.completed_at = new Date().getTime();
    task.current_at = task.completed_at;

    fs.writeFileSync(
      this.resolveDatabaseTaskPath(username, targetTask.id),
      JSON.stringify(task)
    );

    this.clientsList[username].ws.forEach((c) => {
      c.send(
        JSON.stringify({
          type: "updated",
          data: {
            task,
          },
        })
      );
    });
  }

  consoleLogStats() {
    console.log(
      Object.keys(this.clientsList).map((c) => ({
        name: c,
        clients: this.clientsList[c].ws.length,
        tasks: fs.readdirSync(path.resolve(__dirname, `./database/users/${c}`))
          .length,
      }))
    );
  }
}

const clients = new Clients();
const wss = new WebSocketServer({ port: 8080 });
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
    } else {
      if (!event.data.token) {
        ws.send(
          JSON.stringify({
            type: "error",
            data: {
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
