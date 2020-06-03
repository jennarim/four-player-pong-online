const c = require('./../lib/constants.js');

class Paddle {
    constructor(x, y, width, height, playerNo, color) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.playerNo = playerNo;
        this.color = color;

        // For Bots
        this.vx = 2;
        this.vy = 2;
    }

    setX(x) {
        this.x = x;
    }

    setY(y) {
        this.y = y;
    }

    getX() {
        return this.x;
    }

    getY() {
        return this.y;
    }

    getWidth() {
        return this.width;
    }

    getHeight() {
        return this.height;
    }

    followMouse(mousePos) {
        let paddlePosX, paddlePosY;
        switch (this.playerNo) {
            case 1: // left
            case 2: // right
                const minY = c.WALL_HEIGHT;
                const maxY = minY + c.GOAL_POST_LENGTH;
                if (mousePos.y < minY) {
                    paddlePosY = minY;
                } else if ((mousePos.y + c.PADDLE_LONG_LENGTH) > maxY) {
                    paddlePosY = maxY - c.PADDLE_LONG_LENGTH;
                } else {
                    paddlePosY = mousePos.y;
                }
                this.y = paddlePosY;
                break;
            case 3: // up
            case 4: // down
                const minX = c.WALL_WIDTH;
                const maxX = minX + c.GOAL_POST_LENGTH;
                if (mousePos.x < minX) {
                    paddlePosX = minX;
                } else if ((mousePos.x + c.PADDLE_LONG_LENGTH) > maxX) {
                    paddlePosX = maxX - c.PADDLE_LONG_LENGTH;
                } else {
                    paddlePosX = mousePos.x;
                }
                this.x = paddlePosX;
                break;
        }
    }

    moveBot() {
        let paddlePosX, paddlePosY;
        switch (this.playerNo) {
            case 1: // left
            case 2: // right
                paddlePosY = this.y + this.vy;
                const minY = c.WALL_HEIGHT;
                const maxY = minY + c.GOAL_POST_LENGTH;
                if (paddlePosY < minY) {
                    paddlePosY = minY;
                    this.vy *= -1;
                } else if ((paddlePosY + c.PADDLE_LONG_LENGTH) > maxY) {
                    paddlePosY = maxY - c.PADDLE_LONG_LENGTH;
                    this.vy *= -1;
                } 
                this.y = paddlePosY;
                break;
            case 3: // up
            case 4: // down
                paddlePosX = this.x + this.vx;
                const minX = c.WALL_WIDTH;
                const maxX = minX + c.GOAL_POST_LENGTH;
                if (paddlePosX < minX) {
                    paddlePosX = minX;
                    this.vx *= -1;
                } else if ((paddlePosX + c.PADDLE_LONG_LENGTH) > maxX) {
                    paddlePosX = maxX - c.PADDLE_LONG_LENGTH;
                    this.vx *= -1;
                }
                this.x = paddlePosX;
                break;
        }
    }

    render(ctx) {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
    }
}

module.exports = Paddle;