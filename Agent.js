import { ChatOllama } from "@langchain/ollama";
import { DynamicTool } from "@langchain/core/tools";
import { createAgent } from "langchain";
import fs from "fs/promises";
import readline from "readline";

const llm = new ChatOllama({
  model: "deepseek-coder:6.7B-instruct",
  temperature: 0.2,
});

const readFileTool = new DynamicTool({
  name: "read_file",
  description: "Reads a text file from disk. Input: full file path",
  func: async (filePath) => {
    try {
      const data = await fs.readFile(filePath, "utf-8");
      return data;
    } catch (err) {
      return `Error reading file: ${err.message}`;
    }
  },
});

const writeFileTool = new DynamicTool({
  name: "write_file",
  description: "Writes content to a text file. Input format: 'path::content'",
  func: async (input) => {
    try {
      const [filePath, content] = input.split("::");
      await fs.writeFile(filePath, content, "utf-8");
      return `Successfully wrote to ${filePath}`;
    } catch (err) {
      return `Error writing file: ${err.message}`;
    }
  },
});

const listDirTool = new DynamicTool({
  name: "list_directory",
  description: "Lists all files in a directory. Input: directory path",
  func: async (dirPath) => {
    try {
      const files = await fs.readdir(dirPath);
      return files.join("\n");
    } catch (err) {
      return `Error listing directory: ${err.message}`;
    }
  },
});

async function interactiveAgent() {
  const tools = [readFileTool, writeFileTool, listDirTool];
  
  // Create agent using v1 API
  const agent = createAgent({
    model: llm,
    tools: tools,
    systemPrompt: "You are a helpful assistant that can read and write files. Use the available tools to help the user with file operations.",
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ask = () => {
    rl.question("Prompt> ", async (input) => {
      if (input.toLowerCase() === "exit") return rl.close();
      try {
        // Use invoke with messages format
        const response = await agent.invoke({
          messages: [
            { role: "user", content: input }
          ]
        });
        console.log(response.messages[response.messages.length - 1].content);
      } catch (error) {
        console.error("Error:", error.message);
      }
      ask();
    });
  };

  ask();
}

interactiveAgent();