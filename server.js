import { WebSocketServer } from "ws";
import fs from "fs";

const wss = new WebSocketServer({ port: 8080 });

class Clients {
  constructor() {
    this.clientsList = {};
    this.saveClient = this.saveClient.bind(this);
  }

  saveClient(username, client) {
    if (!this.clientsList[username]) {
      if (!fs.existsSync(`database/${username}`)) {
        fs.mkdirSync(`database/${username}`);
      }

      this.clientsList[username] = {
        ws: [client],
        tasks: [],
        timers: [],
      };
    } else {
      this.clientsList[username].ws.push(client);
    }

    const files = fs.readdirSync(`database/${username}`);

    const tasks = [];
    files.forEach((f) => {
      const task = JSON.parse(
        fs.readFileSync(`database/${username}/${f}`, "utf-8")
      );

      if (task?.id) {
        tasks.push(task);
      }
    });

    client.send(
      JSON.stringify({
        type: "list",
        tasks,
      })
    );
  }

  add(username, targetTask, autostart) {
    const task = {
      id: fs.readdirSync(`database/${username}`).length + 1,
      name: targetTask.name,
      project: targetTask?.project,
      created_at: new Date().getTime(),
      started_at: 0,
      current_at: 0,
      completed_at: 0,
    };

    fs.writeFileSync(
      `database/${username}/task_${task.id}.json`,
      JSON.stringify(task)
    );

    if (autostart) {
      this.start(username, task);
    }

    this.clientsList[username].ws.forEach((c) => {
      c.send(
        JSON.stringify({
          type: "created",
          task: task,
        })
      );
    });
  }

  delete(username, targetTask) {
    fs.unlinkSync(`database/${username}/task_${targetTask.id}.json`);

    this.clientsList[username].ws.forEach((c) => {
      c.send(
        JSON.stringify({
          type: "deleted",
          task: targetTask,
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
        `database/${username}/task_${targetTask.id}.json`,
        "utf-8"
      )
    );

    if (task.started_at) {
      return;
    }

    task.started_at = new Date().getTime();

    fs.writeFileSync(
      `database/${username}/task_${targetTask.id}.json`,
      JSON.stringify(task)
    );

    this.clientsList[username].ws.forEach((c) => {
      c.send(
        JSON.stringify({
          type: "updated",
          task: task,
        })
      );
    });
  }

  complete(username, targetTask) {
    const task = JSON.parse(
      fs.readFileSync(
        `database/${username}/task_${targetTask.id}.json`,
        "utf-8"
      )
    );

    if (task.completed_at) {
      return;
    }

    task.completed_at = new Date().getTime();

    fs.writeFileSync(
      `database/${username}/task_${targetTask.id}.json`,
      JSON.stringify(task)
    );

    this.clientsList[username].ws.forEach((c) => {
      c.send(
        JSON.stringify({
          type: "updated",
          task: task,
        })
      );
    });
  }

  updateTaskTimer(username, targetTask) {
    const task = JSON.parse(
      fs.readFileSync(
        `database/${username}/task_${targetTask.id}.json`,
        "utf-8"
      )
    );

    if (!task?.id || task.id !== targetTask.id) {
      return targetTask;
    }

    task.current_at = new Date().getTime();

    fs.writeFileSync(
      `database/${username}/task_${targetTask.id}.json`,
      JSON.stringify(task)
    );

    return task;
  }

  createTimer(username, task) {
    return setInterval(() => {
      const updatedTask = this.updateTaskTimer(username, task);
      this.clientsList[username].ws.forEach((c) => {
        c.send(
          JSON.stringify({
            type: "updated",
            task: updatedTask,
          })
        );
      });
    }, 1000);
  }

  freshTimers(username) {
    // Clear all current timers.
    this.clientsList[username].timers.forEach((ti) => {
      if (ti.interval) {
        clearInterval(ti.interval);
      }
    });

    // Init new timers.
    this.clientsList[username].timers = [];

    const files = fs.readdirSync(`database/${username}`);
    const tasks = [];
    files.forEach((f) => {
      const task = JSON.parse(
        fs.readFileSync(`database/${username}/${f}`, "utf-8")
      );

      if (task?.id) {
        tasks.push(task);
      }
    });

    tasks.forEach((task) => {
      if (!task.completed_at && task.started_at) {
        const ti = {
          taskId: task.id,
          interval: this.createTimer(username, task),
        };

        this.clientsList[username].timers.push(ti);
      }
    });
  }
}

const clients = new Clients();
let clientId = JSON.parse(
  fs.readFileSync("database/clients.json", "utf-8")
).count;
const genereateClientId = () => {
  ++clientId;
  fs.writeFileSync(
    "database/clients.json",
    JSON.stringify({ count: clientId })
  );

  return clientId;
};

wss.on("connection", function connection(ws) {
  ws.id = genereateClientId();

  ws.on("close", () => {
    if (ws.username) {
      clients.clientsList[ws.username].ws = clients.clientsList[
        ws.username
      ].ws.filter((_) => _.id !== ws.id);
    }
  });

  ws.on("message", function message(data) {
    const event = JSON.parse(data);
    if (!event.username) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Please login!",
        })
      );

      return;
    }

    if (event.type === "login") {
      ws.username = event.username;
      clients.saveClient(event.username, ws);
    } else if (event.type === "create") {
      clients.add(event.username, event.task);
    } else if (event.type === "delete") {
      clients.delete(event.username, event.task);
    } else if (event.type === "start") {
      clients.start(event.username, event.task);
    } else if (event.type === "complete") {
      clients.complete(event.username, event.task);
    }

    clients.freshTimers(event.username);

    console.log(
      Object.keys(clients.clientsList).map((c) => ({
        name: c,
        clients: clients.clientsList[c].ws.length,
        tasks: fs.readdirSync(`database/${c}`).length,
        timers: clients.clientsList[c].timers.length,
      }))
    );
  });
});
