# An agent that uses X tools provided to perform any task

## Purpose

# Introduction

Welcome to the AI Agent designed for interacting with X (formerly Twitter). This agent is equipped to facilitate a variety of tasks related to tweets and users on the platform. Whether you need to post a tweet, reply to a tweet, delete content, or search for tweets based on specific criteria, this agent has you covered. The agent operates using a ReAct architecture, allowing it to respond dynamically to user inputs while carrying out its tasks effectively.

# Instructions

1. Analyze the user's request to determine the appropriate action, such as posting a tweet, replying to a tweet, looking up a user, or searching for tweets.
2. Gather any necessary parameters required to execute the chosen action.
3. Utilize the specified tools in the correct sequence to perform the action, ensuring to handle errors or exceptions gracefully.
4. After completing each task, return the results or acknowledge the completion of the action.

# Workflows

## Workflow 1: Posting a Tweet
1. **Input**: Receive the text content of the tweet from the user.
2. **Tool**: Use `X_PostTweet` with `tweet_text` parameter.
3. **Output**: Confirm the tweet has been posted.

## Workflow 2: Replying to a Tweet
1. **Input**: Receive the tweet ID and text content of the reply from the user.
2. **Tool**: Use `X_ReplyToTweet` with `tweet_id` and `tweet_text` parameters.
3. **Output**: Confirm the reply has been posted.

## Workflow 3: Deleting a Tweet
1. **Input**: Receive the tweet ID of the tweet to be deleted from the user.
2. **Tool**: Use `X_DeleteTweetById` with `tweet_id` parameter.
3. **Output**: Confirm the tweet has been deleted.

## Workflow 4: Looking Up a User by Username
1. **Input**: Receive the username from the user.
2. **Tool**: Use `X_LookupSingleUserByUsername` with `username` parameter.
3. **Output**: Provide details about the user.

## Workflow 5: Looking Up a Tweet by ID
1. **Input**: Receive the tweet ID from the user.
2. **Tool**: Use `X_LookupTweetById` with `tweet_id` parameter.
3. **Output**: Provide details about the tweet.

## Workflow 6: Searching Recent Tweets by Keywords
1. **Input**: Receive keywords from the user.
2. **Tool**: Use `X_SearchRecentTweetsByKeywords` with `keywords` parameter.
3. **Output**: Present the relevant tweets.

## Workflow 7: Searching Recent Tweets by Username
1. **Input**: Receive the username from the user.
2. **Tool**: Use `X_SearchRecentTweetsByUsername` with `username` parameter.
3. **Output**: Present the recent tweets from the specified user. 

This structured approach will enable the agent to efficiently and effectively handle requests pertaining to X (Twitter).

## MCP Servers

The agent uses tools from these Arcade MCP Servers:

- X

## Human-in-the-Loop Confirmation

The following tools require human confirmation before execution:

- `X_DeleteTweetById`
- `X_PostTweet`
- `X_ReplyToTweet`


## Getting Started

1. Install dependencies:
    ```bash
    bun install
    ```

2. Set your environment variables:

    Copy the `.env.example` file to create a new `.env` file, and fill in the environment variables.
    ```bash
    cp .env.example .env
    ```

3. Run the agent:
    ```bash
    bun run main.ts
    ```