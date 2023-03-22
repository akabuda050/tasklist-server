import { v4 as uuid } from "uuid";
import crypto from "crypto";
import { __filename, __dirname, fs, path } from "./fsUtils.mjs";
import { registrationSecrets } from "./config.mjs";

export class Clients {
  constructor() {
    this.clientsList = [];
    this.saveClient = this.saveClient.bind(this);
    this.removeClient = this.removeClient.bind(this);

    this.registrationSecrets = registrationSecrets;
  }

  prepareClient(ws) {
    ws.id = uuid();

    return ws;
  }

  resolveDatabaseUsersPath() {
    return path.resolve(__dirname, `./database/users`);
  }

  resolveDatabaseUserPath(username) {
    return path.resolve(`${this.resolveDatabaseUsersPath()}/${username}`);
  }

  resolveDatabaseTaskPath(username, taskId) {
    return path.resolve(
      `${this.resolveDatabaseUserPath(username)}/task_${taskId}.json`
    );
  }

  saveClient(username, client) {
    if (this.clientsList.find((c) => c.id === client.id)) return;

    this.clientsList.push({
      id: client.id,
      username: username,
      client,
    });
  }

  broadcatsUserClients(username, payload) {
    this.clientsList
      .filter((c) => c.username === username)
      .forEach(({ client }) => {
        client.send(payload);
      });
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
    if (this.registrationSecrets.includes(secret)) {
      const hash = this.generateHash(username, password);

      if (fs.existsSync(this.resolveDatabaseUserPath(hash))) {
        client.send(
          JSON.stringify({
            type: "error",
            data: {
              error: "registration",
              message: "User already exists!",
            },
          })
        );

        return;
      }

      fs.mkdirSync(this.resolveDatabaseUserPath(hash));
      this.saveClient(hash, client);

      client.send(
        JSON.stringify({
          type: "registered",
          data: {
            token: hash,
            username,
          },
        })
      );
    } else {
      client.send(
        JSON.stringify({
          type: "error",
          data: {
            error: "registration",
            message: "Wrong secret provided!",
          },
        })
      );
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
            username,
          },
        })
      );
    } else {
      client.send(
        JSON.stringify({
          type: "error",
          data: {
            error: "login",
            message: "Wrong credentials!",
          },
        })
      );
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
      priority: targetTask.priority,
      created_at: new Date().getTime(),
      started_at: autostart ? new Date().getTime() : null,
      completed_at: null,
      elapsed: 0,
    };

    fs.writeFileSync(
      this.resolveDatabaseTaskPath(username, task.id),
      JSON.stringify(task)
    );

    this.broadcatsUserClients(
      username,
      JSON.stringify({
        type: "created",
        data: {
          task,
        },
      })
    );
  }

  delete(username, targetTask) {
    const taskPath = this.resolveDatabaseTaskPath(username, targetTask.id);
    if (fs.existsSync(taskPath)) {
      fs.unlinkSync(taskPath);
    }

    this.broadcatsUserClients(
      username,
      JSON.stringify({
        type: "deleted",
        data: {
          task: targetTask,
        },
      })
    );
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

    // Can't start already started or completed task.
    if (task.started_at || this.completed_at) {
      return;
    }

    task.started_at = new Date().getTime();

    fs.writeFileSync(
      this.resolveDatabaseTaskPath(username, targetTask.id),
      JSON.stringify(task)
    );

    this.broadcatsUserClients(
      username,
      JSON.stringify({
        type: "updated",
        data: {
          task,
        },
      })
    );
  }

  pause(username, targetTask) {
    const task = JSON.parse(
      fs.readFileSync(
        this.resolveDatabaseTaskPath(username, targetTask.id),
        "utf-8"
      )
    );

    // Can't pause un-started or paused or completed task.
    if (!task.started_at || task.paused_at || task.completed_at) {
      return;
    }

    task.paused_at = new Date().getTime();

    fs.writeFileSync(
      this.resolveDatabaseTaskPath(username, targetTask.id),
      JSON.stringify(task)
    );

    this.broadcatsUserClients(
      username,
      JSON.stringify({
        type: "updated",
        data: {
          task,
        },
      })
    );
  }

  resume(username, targetTask) {
    const task = JSON.parse(
      fs.readFileSync(
        this.resolveDatabaseTaskPath(username, targetTask.id),
        "utf-8"
      )
    );

    // Can't resume un-started or completed task.
    if (!task.started_at || task.completed_at) {
      return;
    }

    task.elapsed += new Date().getTime() - task.paused_at;
    task.paused_at = null;

    fs.writeFileSync(
      this.resolveDatabaseTaskPath(username, targetTask.id),
      JSON.stringify(task)
    );

    this.broadcatsUserClients(
      username,
      JSON.stringify({
        type: "updated",
        data: {
          task,
        },
      })
    );
  }

  restart(username, targetTask) {
    const task = JSON.parse(
      fs.readFileSync(
        this.resolveDatabaseTaskPath(username, targetTask.id),
        "utf-8"
      )
    );

    // Can't restart un-started or non-completed task.
    if (!task.started_at || !task.completed_at) {
      return;
    }

    task.started_at = new Date().getTime();
    task.completed_at = null;
    task.paused_at = null;
    task.elapsed = 0;

    fs.writeFileSync(
      this.resolveDatabaseTaskPath(username, targetTask.id),
      JSON.stringify(task)
    );

    this.broadcatsUserClients(
      username,
      JSON.stringify({
        type: "updated",
        data: {
          task,
        },
      })
    );
  }

  complete(username, targetTask) {
    const task = JSON.parse(
      fs.readFileSync(
        this.resolveDatabaseTaskPath(username, targetTask.id),
        "utf-8"
      )
    );

    // Can't complete already completed task.
    if (task.completed_at) {
      return;
    }

    const timestamp = new Date().getTime();
    task.started_at = task.started_at || timestamp;
    task.completed_at = timestamp;
    task.elapsed =
      (task.paused_at || task.completed_at) - task.started_at - task.elapsed;
    task.paused_at = null;

    fs.writeFileSync(
      this.resolveDatabaseTaskPath(username, targetTask.id),
      JSON.stringify(task)
    );

    this.broadcatsUserClients(
      username,
      JSON.stringify({
        type: "updated",
        data: {
          task,
        },
      })
    );
  }

  removeClient(client) {
    this.clientsList = this.clientsList.filter((c) => c.id !== client.id);
  }

  consoleLogStats() {
    console.log(
      this.clientsList.map((c) => ({
        name: c.username,
        clients: this.clientsList.filter((_) => _.username === c.username)
          .length,
        tasks: fs.readdirSync(
          path.resolve(__dirname, `./database/users/${c.username}`)
        ).length,
      }))
    );
  }
}
