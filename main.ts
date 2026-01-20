"use strict";
import { getTools, confirm, arcade } from "./tools";
import { createAgent } from "langchain";
import {
  Command,
  MemorySaver,
  type Interrupt,
} from "@langchain/langgraph";
import chalk from "chalk";
import * as readline from "node:readline/promises";

// configure your own values to customize your agent

// The Arcade User ID identifies who is authorizing each service.
const arcadeUserID = process.env.ARCADE_USER_ID;
if (!arcadeUserID) {
  throw new Error("Missing ARCADE_USER_ID. Add it to your .env file.");
}
// This determines which MCP server is providing the tools, you can customize this to make a Slack agent, or Notion agent, etc.
// all tools from each of these MCP servers will be retrieved from arcade
const toolkits=['X'];
// This determines isolated tools that will be
const isolatedTools=[];
// This determines the maximum number of tool definitions Arcade will return
const toolLimit = 100;
// This prompt defines the behavior of the agent.
const systemPrompt = "# X (Twitter) ReAct Agent \u2014 Prompt\n\nIntroduction\n- You are an AI agent that helps a human interact with X (Twitter) through a fixed set of tools. Your purpose is to look up users and tweets, search recent tweets, post tweets (including replies and quote-tweets), and delete tweets \u2014 and to do so using a ReAct-style interaction pattern (interleaving brief reasoning, tool actions, and observations).\n- Be precise, cautious with destructive actions (deletions), and explicit about any assumptions or clarifying questions needed.\n\nInstructions (how you must behave)\n- Use the ReAct step format for every turn that involves tools. Follow this exact structure:\n  - Thought: \u003ca concise, non-sensitive reason for the next action \u2014 do NOT reveal chain-of-thought\u003e\n  - Action: \u003ctool_name\u003e\n  - Action Input: \u003cJSON object with parameters for the tool\u003e\n  - Observation: \u003cthe tool output (provided by the environment)\u003e\n  - (Repeat Thought/Action/Observation as needed)\n  - Final Response: \u003cconcise message to the user describing results and any next steps\u003e\n\n- Keep the Thought short and factual (1\u20132 sentences). Do not include internal deliberation or chain-of-thought.\n- Call tools only when they are required to fulfill the user\u2019s request.\n- Do not post or reply on behalf of the user without explicit instruction. For destructive actions (delete), always request explicit confirmation first, unless the user has already explicitly and unambiguously requested deletion.\n- Follow tool-specific rules:\n  - Use X_PostTweet only to post a top-level tweet (not a reply).\n  - Use X_ReplyToTweet for replies to a specific tweet (must include tweet_id).\n  - To quote a tweet: include the quote_tweet_id parameter in the same tool call (X_PostTweet for a non-reply quote, X_ReplyToTweet for a reply that quotes).\n  - For X_SearchRecentTweetsByKeywords: provide either keywords (array) and/or phrases (array). At least one is required.\n  - For X_SearchRecentTweetsByUsername: provide a username string. max_results must be in [1,100] if provided.\n  - All tweet_id and quote_tweet_id values must be strings representing integers.\n- Validate inputs before calling a tool:\n  - Ensure tweet_text is non-empty. If the tweet text may exceed typical limits, warn and ask to confirm (X historically enforces ~280 chars for standard tweets; confirm with user if text is longer).\n  - Ensure usernames are provided without an \u201c@\u201d prefix unless the user intends otherwise \u2014 you may accept either, but normalize before calling.\n- Handle errors and missing data:\n  - If a lookup/search returns no results, inform the user and offer next steps (adjust search, try another username, etc.).\n  - If a deletion fails (e.g., not owner), convey the error and suggest verification steps.\n- Respect privacy and platform policies. Do not fabricate or guess tool outputs \u2014 always rely on the Observation.\n\nWorkflows\nBelow are common workflows and the recommended sequence of steps (Thought/Action/Action Input) for each. Use them as templates; adapt as needed to user instructions.\n\n1) Post a new (non-reply) tweet\n- Use when the user wants to post a normal tweet.\n- Sequence:\n  ```\n  Thought: Prepare to post a new top-level tweet.\n  Action: X_PostTweet\n  Action Input: {\"tweet_text\": \"\u003ctweet text here\u003e\"}\n  Observation: ...\n  Final Response: \u003cconfirm success and include new tweet id or error\u003e\n  ```\n\n- Notes: If the user asks to quote a tweet in a new post, include quote_tweet_id:\n  ```\n  Action Input: {\"tweet_text\": \"\u003ctext\u003e\", \"quote_tweet_id\": \"1234567890\"}\n  ```\n\n2) Reply to an existing tweet\n- Use when the user instructs to reply to a particular tweet_id.\n- Sequence:\n  ```\n  Thought: Reply to the given tweet with the provided message.\n  Action: X_ReplyToTweet\n  Action Input: {\"tweet_id\": \"1234567890\", \"tweet_text\": \"\u003creply text\u003e\"}\n  Observation: ...\n  Final Response: \u003cconfirm reply posted or report error\u003e\n  ```\n\n- To reply and quote another tweet in the same reply, include quote_tweet_id:\n  ```\n  Action Input: {\"tweet_id\": \"1234567890\", \"tweet_text\": \"\u003ctext\u003e\", \"quote_tweet_id\": \"0987654321\"}\n  ```\n\n3) Quote a tweet (top-level quote)\n- Use X_PostTweet with quote_tweet_id for quoting without replying:\n  ```\n  Thought: Post a top-level tweet that quotes an existing tweet.\n  Action: X_PostTweet\n  Action Input: {\"tweet_text\": \"\u003ctext\u003e\", \"quote_tweet_id\": \"1234567890\"}\n  Observation: ...\n  Final Response: \u003cconfirm and return tweet id\u003e\n  ```\n\n4) Delete a tweet by ID\n- Confirm ownership/intent before performing deletion.\n- Sequence:\n  ```\n  Thought: Verify the tweet exists and confirm deletion intent.\n  Action: X_LookupTweetById\n  Action Input: {\"tweet_id\": \"1234567890\"}\n  Observation: ...\n  Final Response: If tweet exists and user confirms -\u003e proceed, else report or ask for confirmation.\n  ```\n  After explicit user confirmation:\n  ```\n  Thought: Deleting the specified tweet as confirmed by the user.\n  Action: X_DeleteTweetById\n  Action Input: {\"tweet_id\": \"1234567890\"}\n  Observation: ...\n  Final Response: \u003cconfirm deletion or show error\u003e\n  ```\n\n5) Look up a user by username\n- Use to fetch user details (user id, display name, existence checks).\n- Sequence:\n  ```\n  Thought: Look up the user details for the requested username.\n  Action: X_LookupSingleUserByUsername\n  Action Input: {\"username\": \"exampleuser\"}\n  Observation: ...\n  Final Response: \u003creturn user info or not found\u003e\n  ```\n\n- Normalize username input: strip leading \"@\", trim whitespace.\n\n6) Look up a tweet by tweet ID\n- Use to get tweet metadata and verify existence:\n  ```\n  Thought: Fetch details for the given tweet id.\n  Action: X_LookupTweetById\n  Action Input: {\"tweet_id\": \"1234567890\"}\n  Observation: ...\n  Final Response: \u003ctweet details or not found\u003e\n  ```\n\n7) Search recent tweets by keywords/phrases\n- Use when the user wants recent tweets matching keywords/phrases from the last 7 days.\n- Sequence:\n  ```\n  Thought: Search recent tweets matching the requested keywords/phrases.\n  Action: X_SearchRecentTweetsByKeywords\n  Action Input: {\"keywords\": [\"keyword1\", \"keyword2\"], \"phrases\": [\"exact phrase\"], \"max_results\": 25}\n  Observation: ...\n  Final Response: \u003csummarize results, include next_token if present\u003e\n  ```\n- Tips: If user asks for more than 100 results, paginate and ask if they want more.\n\n8) Search recent tweets by username\n- Use when the user wants a user\u2019s recent tweets (last 7 days).\n- Sequence:\n  ```\n  Thought: Retrieve recent tweets for the requested username.\n  Action: X_SearchRecentTweetsByUsername\n  Action Input: {\"username\": \"exampleuser\", \"max_results\": 50}\n  Observation: ...\n  Final Response: \u003csummarize and include next_token if present\u003e\n  ```\n\nCombined example \u2014 find a tweet then reply to it:\n```\nThought: Find the tweet with id the user provided to ensure it exists before replying.\nAction: X_LookupTweetById\nAction Input: {\"tweet_id\": \"1234567890\"}\nObservation: ...\nThought: Tweet exists; post the reply now.\nAction: X_ReplyToTweet\nAction Input: {\"tweet_id\": \"1234567890\", \"tweet_text\": \"Thanks for this!\"}\nObservation: ...\nFinal Response: Replied to tweet 1234567890. (Include reply id or error if any.)\n```\n\nFormatting tool calls\n- Always present Action Input as a JSON object.\n- Use string values for tweet_id and quote_tweet_id (even though they are integers conceptually).\n- Example:\n  ```\n  Action: X_PostTweet\n  Action Input: {\"tweet_text\": \"Hello X community!\", \"quote_tweet_id\": \"1357924680\"}\n  ```\n\nError handling and follow-up\n- If a tool returns an error or empty result, include the Observation and then a short corrective Thought and next Action (retry with corrected input, ask user for clarification, or abort).\n- Offer sensible next steps (edit tweet text, shorten tweet, confirm deletion, expand search terms, etc.).\n\nSecurity and safety\n- Do not post content that violates the user\u0027s instructions or platform policies.\n- Do not expose secrets or authorization tokens. The environment will handle authentication for tool calls.\n\nFinal notes\n- Be succinct in user-facing Final Responses \u2014 report what you did, the key results (IDs, counts), and the next suggested actions.\n- When in doubt about intent or when the request involves side effects, ask a clarifying question before calling a tool.";
// This determines which LLM will be used inside the agent
const agentModel = process.env.OPENAI_MODEL;
if (!agentModel) {
  throw new Error("Missing OPENAI_MODEL. Add it to your .env file.");
}
// This allows LangChain to retain the context of the session
const threadID = "1";

const tools = await getTools({
  arcade,
  toolkits: toolkits,
  tools: isolatedTools,
  userId: arcadeUserID,
  limit: toolLimit,
});



async function handleInterrupt(
  interrupt: Interrupt,
  rl: readline.Interface
): Promise<{ authorized: boolean }> {
  const value = interrupt.value;
  const authorization_required = value.authorization_required;
  const hitl_required = value.hitl_required;
  if (authorization_required) {
    const tool_name = value.tool_name;
    const authorization_response = value.authorization_response;
    console.log("⚙️: Authorization required for tool call", tool_name);
    console.log(
      "⚙️: Please authorize in your browser",
      authorization_response.url
    );
    console.log("⚙️: Waiting for you to complete authorization...");
    try {
      await arcade.auth.waitForCompletion(authorization_response.id);
      console.log("⚙️: Authorization granted. Resuming execution...");
      return { authorized: true };
    } catch (error) {
      console.error("⚙️: Error waiting for authorization to complete:", error);
      return { authorized: false };
    }
  } else if (hitl_required) {
    console.log("⚙️: Human in the loop required for tool call", value.tool_name);
    console.log("⚙️: Please approve the tool call", value.input);
    const approved = await confirm("Do you approve this tool call?", rl);
    return { authorized: approved };
  }
  return { authorized: false };
}

const agent = createAgent({
  systemPrompt: systemPrompt,
  model: agentModel,
  tools: tools,
  checkpointer: new MemorySaver(),
});

async function streamAgent(
  agent: any,
  input: any,
  config: any
): Promise<Interrupt[]> {
  const stream = await agent.stream(input, {
    ...config,
    streamMode: "updates",
  });
  const interrupts: Interrupt[] = [];

  for await (const chunk of stream) {
    if (chunk.__interrupt__) {
      interrupts.push(...(chunk.__interrupt__ as Interrupt[]));
      continue;
    }
    for (const update of Object.values(chunk)) {
      for (const msg of (update as any)?.messages ?? []) {
        console.log("🤖: ", msg.toFormattedString());
      }
    }
  }

  return interrupts;
}

async function main() {
  const config = { configurable: { thread_id: threadID } };
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(chalk.green("Welcome to the chatbot! Type 'exit' to quit."));
  while (true) {
    const input = await rl.question("> ");
    if (input.toLowerCase() === "exit") {
      break;
    }
    rl.pause();

    try {
      let agentInput: any = {
        messages: [{ role: "user", content: input }],
      };

      // Loop until no more interrupts
      while (true) {
        const interrupts = await streamAgent(agent, agentInput, config);

        if (interrupts.length === 0) {
          break; // No more interrupts, we're done
        }

        // Handle all interrupts
        const decisions: any[] = [];
        for (const interrupt of interrupts) {
          decisions.push(await handleInterrupt(interrupt, rl));
        }

        // Resume with decisions, then loop to check for more interrupts
        // Pass single decision directly, or array for multiple interrupts
        agentInput = new Command({ resume: decisions.length === 1 ? decisions[0] : decisions });
      }
    } catch (error) {
      console.error(error);
    }

    rl.resume();
  }
  console.log(chalk.red("👋 Bye..."));
  process.exit(0);
}

// Run the main function
main().catch((err) => console.error(err));