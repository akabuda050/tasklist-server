import { v4 as uuid } from "uuid";
import crypto from "crypto";
import { __filename, __dirname, fs, path } from "./fsUtils.mjs";

export class Clients {
  constructor() {
    this.clientsList = {};
    this.saveClient = this.saveClient.bind(this);
    this.registrationSecrets = process.env.registration_secrets.split("|");
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
      created_at: new Date().getTime(),
      started_at: autostart ? new Date().getTime() : 0,
      current_at: autostart ? new Date().getTime() : 0,
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
    task.current_at = new Date().getTime();

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
