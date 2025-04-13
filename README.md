# Snake Game on Monad Testnet

A blockchain-based Snake game where players can earn NFTs based on their scores.

## Prerequisites
- Node.js (v16 or higher)
- npm

## Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/intellygentle/monad-snake-game.git
   cd monad-snake-game
   ```

2. ```bash
   npm install
   ```

3. ```bash
   chmod +x playSnake.js
   ```

4. ```bash
   node playSnake.js
   ```


# How It Works

The game connects to the Monad testnet.

You control a snake that moves toward food to increase your score.

As your score reaches certain thresholds (100, 200, ..., 1000), you mint NFTs.

The game ends when you mint the Class 10 NFT (score 1000).

Ensure you have a stable internet connection.

Verify your private key is valid for the Monad testnet.

Check that you have sufficient testnet funds for gas fees.

If you encounter errors, try deleting ~/.snakeGame/config.json and re-entering your private key.


