import Canvas from 'canvas';
import {BotConfig} from '../../bot/config/BotConfig';
import {AttachmentBuilder} from 'discord.js';
import {BuySellData} from '../data/global/BuySellData';
import {CanvasUtils} from './CanvasUtils';
import {BoarUtils} from '../boar/BoarUtils';
import moment from 'moment';

/**
 * {@link MarketImageGenerator MarketImageGenerator.ts}
 *
 * Creates the boar market image.
 *
 * @license {@link http://www.apache.org/licenses/ Apache-2.0}
 * @copyright WeslayCodes 2023
 */
export class MarketImageGenerator {
    private config: BotConfig = {} as BotConfig;
    private itemPricing: {id: string, type: string, instaSells: BuySellData[], instaBuys: BuySellData[]}[] = [];
    private userBuyOrders: {data: BuySellData, id: string, type: string}[] = [];
    private userSellOrders: {data: BuySellData, id: string, type: string}[] = [];

    /**
     * Creates a new leaderboard image generator
     *
     * @param itemPricing
     * @param userBuyOrders
     * @param userSellOrders
     * @param config - Used to get strings, paths, and other information
     */
    constructor(
        itemPricing: {id: string, type: string, instaSells: BuySellData[], instaBuys: BuySellData[]}[],
        userBuyOrders: {data: BuySellData, id: string, type: string}[],
        userSellOrders: {data: BuySellData, id: string, type: string}[],
        config: BotConfig
    ) {
        this.itemPricing = itemPricing;
        this.userBuyOrders = userBuyOrders;
        this.userSellOrders = userSellOrders;
        this.config = config;
    }

    /**
     * Used when leaderboard boar type has changed
     *
     * @param itemPricing
     * @param userBuyOrders
     * @param userSellOrders
     * @param config - Used to get strings, paths, and other information
     */
    public updateInfo(
        itemPricing: {id: string, type: string, instaSells: BuySellData[], instaBuys: BuySellData[]}[],
        userBuyOrders: {data: BuySellData, id: string, type: string}[],
        userSellOrders: {data: BuySellData, id: string, type: string}[],
        config: BotConfig
    ): void {
        this.itemPricing = itemPricing;
        this.userBuyOrders = userBuyOrders;
        this.userSellOrders = userSellOrders;
        this.config = config;
    }

    public async makeOverviewImage(page: number) {
        const strConfig = this.config.stringConfig;
        const pathConfig = this.config.pathConfig;
        const nums = this.config.numberConfig;
        const colorConfig = this.config.colorConfig;

        const underlay = pathConfig.otherAssets + pathConfig.marketOverviewUnderlay;
        const overlay = pathConfig.otherAssets + pathConfig.marketOverviewOverlay;

        const font = `${nums.fontMedium}px ${strConfig.fontName}`;

        const canvas = Canvas.createCanvas(...nums.marketSize);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(await Canvas.loadImage(underlay), ...nums.originPos);

        const curShowing = this.itemPricing.slice(page*8, (page+1) * 8);

        const imgStartPos = [25, 205];
        const buyStartPos = [248, 698];
        const sellStartPos = [248, 753];
        const incX = 466;
        const incY = 593;

        const cols = 4;

        for (let i=0; i<curShowing.length; i++) {
            const item = curShowing[i];
            const file = pathConfig[item.type] + (this.config.itemConfigs[item.type][item.id].staticFile
                ? this.config.itemConfigs[item.type][item.id].staticFile
                : this.config.itemConfigs[item.type][item.id].file);

            const imagePos: [number, number] = [
                imgStartPos[0] + i % cols * incX,
                imgStartPos[1] + Math.floor(i / cols) * incY
            ];

            ctx.drawImage(await Canvas.loadImage(file), ...imagePos, 443, 443);
        }

        ctx.drawImage(await Canvas.loadImage(overlay), ...nums.originPos);

        for (let i=0; i<curShowing.length; i++) {
            const item = curShowing[i];

            const buyPos: [number, number] = [
                buyStartPos[0] + i % cols * incX,
                buyStartPos[1] + Math.floor(i / cols) * incY
            ];
            const sellPos: [number, number] = [
                sellStartPos[0] + i % cols * incX,
                sellStartPos[1] + Math.floor(i / cols) * incY
            ];

            const buyVal = item.instaBuys.length > 0 ? item.instaBuys[0].price.toLocaleString() : 'N/A';
            const sellVal = item.instaSells.length > 0 ? item.instaSells[0].price.toLocaleString() : 'N/A';

            CanvasUtils.drawText(
                ctx, 'B: %@' + buyVal, buyPos, font, 'center', colorConfig.font, 420, false,
                buyVal !== 'N/A' ? '$' : '', colorConfig.bucks
            );
            CanvasUtils.drawText(
                ctx, 'S: %@' + sellVal, sellPos, font, 'center', colorConfig.font, 420, false,
                sellVal !== 'N/A' ? '$' : '', colorConfig.bucks
            );
        }

        return new AttachmentBuilder(canvas.toBuffer(), { name: `${strConfig.imageName}.png` });
    }

    public async makeBuySellImage(page: number, edition: number) {
        const strConfig = this.config.stringConfig;
        const pathConfig = this.config.pathConfig;
        const nums = this.config.numberConfig;
        const colorConfig = this.config.colorConfig;

        const item = this.itemPricing[page];

        const underlay = pathConfig.otherAssets + pathConfig.marketBuySellUnderlay;
        const overlay = pathConfig.otherAssets + pathConfig.marketBuySellOverlay;
        const file = pathConfig[item.type] + (this.config.itemConfigs[item.type][item.id].staticFile
            ? this.config.itemConfigs[item.type][item.id].staticFile
            : this.config.itemConfigs[item.type][item.id].file);

        let rarityName = 'Powerup';
        let rarityColor = colorConfig.powerup;
        let itemName = this.config.itemConfigs[item.type][item.id].name;
        let lowBuy: string = 'N/A';
        let highSell: string = 'N/A';
        let buyOrderVolume: number = 0;
        let sellOrderVolume: number = 0;

        if (item.type === 'boars') {
            const rarity = BoarUtils.findRarity(item.id, this.config);
            rarityName = rarity[1].name;
            rarityColor = colorConfig['rarity' + rarity[0]];
        }

        if (edition > 0) {
            for (const instaBuy of item.instaBuys) {
                const noEditionExists = instaBuy.num === instaBuy.filledAmount ||
                    instaBuy.listTime + nums.orderExpire < Date.now() ||
                    instaBuy.editions[0] !== edition;

                if (noEditionExists) continue;

                if (lowBuy === 'N/A') {
                    lowBuy = '%@' + instaBuy.price.toLocaleString();
                }

                sellOrderVolume++;
            }

            for (const instaSell of item.instaSells) {
                const noEditionExists = instaSell.num === instaSell.filledAmount ||
                    instaSell.listTime + nums.orderExpire < Date.now() ||
                    instaSell.editions[0] !== edition;

                if (noEditionExists) continue;

                if (highSell === 'N/A') {
                    highSell = '%@' + instaSell.price.toLocaleString();
                }

                buyOrderVolume++;
            }

            itemName += ' #' + edition;
        } else {
            for (const instaBuy of item.instaBuys) {
                const lowBuyUnset = lowBuy === 'N/A';
                const validOrder = instaBuy.num !== instaBuy.filledAmount &&
                    instaBuy.listTime + nums.orderExpire >= Date.now();

                if (!validOrder) continue;

                sellOrderVolume += instaBuy.num - instaBuy.filledAmount;

                if (lowBuyUnset) {
                    lowBuy = '%@' + instaBuy.price.toLocaleString();
                }
            }

            for (const instaSell of item.instaSells) {
                const highSellUnset = highSell === 'N/A';
                const validOrder = instaSell.num !== instaSell.filledAmount &&
                    instaSell.listTime + nums.orderExpire >= Date.now();

                if (!validOrder) continue;

                buyOrderVolume += instaSell.num - instaSell.filledAmount;

                if (highSellUnset) {
                    highSell = '%@' + instaSell.price.toLocaleString();
                }
            }
        }

        const bigFont: string = `${nums.fontBig}px ${strConfig.fontName}`;
        const mediumFont: string = `${nums.fontMedium}px ${strConfig.fontName}`;
        const smallMediumFont: string = `${nums.fontSmallMedium}px ${strConfig.fontName}`;

        const canvas = Canvas.createCanvas(...nums.marketSize);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(await Canvas.loadImage(underlay), ...nums.originPos);

        ctx.drawImage(await Canvas.loadImage(file), 710, 205, 1159, 1159);

        CanvasUtils.drawText(ctx, rarityName.toUpperCase(), [358, 334], mediumFont, 'center', rarityColor);
        CanvasUtils.drawText(
            ctx, itemName, [358, 400], bigFont, 'center', colorConfig.font, 620
        );

        CanvasUtils.drawText(ctx, 'Buy Now Price', [358, 568], mediumFont, 'center', colorConfig.font);
        CanvasUtils.drawText(
            ctx, lowBuy, [358, 639], smallMediumFont, 'center', colorConfig.font,
            undefined, false, '$', colorConfig.bucks
        );

        CanvasUtils.drawText(ctx, 'Sell Now Price', [358, 764], mediumFont, 'center', colorConfig.font);
        CanvasUtils.drawText(
            ctx, highSell, [358, 835], smallMediumFont, 'center', colorConfig.font,
            undefined, false, '$', colorConfig.bucks
        );

        CanvasUtils.drawText(ctx, 'Buy Order Volume', [358, 960], mediumFont, 'center', colorConfig.font);
        CanvasUtils.drawText(
            ctx, buyOrderVolume.toLocaleString(), [358, 1031], smallMediumFont, 'center', colorConfig.font
        );

        CanvasUtils.drawText(ctx, 'Sell Offer Volume', [358, 1156], mediumFont, 'center', colorConfig.font);
        CanvasUtils.drawText(
            ctx, sellOrderVolume.toLocaleString(), [358, 1227], smallMediumFont, 'center', colorConfig.font
        );

        ctx.drawImage(await Canvas.loadImage(overlay), ...nums.originPos);

        return new AttachmentBuilder(canvas.toBuffer(), { name: `${strConfig.imageName}.png` });
    }

    public async makeOrdersImage(page: number) {
        const strConfig = this.config.stringConfig;
        const pathConfig = this.config.pathConfig;
        const nums = this.config.numberConfig;
        const colorConfig = this.config.colorConfig;

        let orderInfo: {data: BuySellData, id: string, type: string};
        let claimStr: string;

        if (page < this.userBuyOrders.length) {
            orderInfo = this.userBuyOrders[page];
            claimStr = orderInfo.data.claimedAmount < orderInfo.data.filledAmount
                ? orderInfo.data.filledAmount - orderInfo.data.claimedAmount + ' ' +
                this.config.itemConfigs[orderInfo.type][orderInfo.id].pluralName
                : 'None';
        } else {
            orderInfo = this.userSellOrders[page - this.userBuyOrders.length];
            claimStr = orderInfo.data.claimedAmount < orderInfo.data.filledAmount
                ? '$' + (orderInfo.data.filledAmount - orderInfo.data.claimedAmount) * orderInfo.data.price
                : 'None';
        }

        let rarityColor = colorConfig.powerup;
        let isSpecial = false;

        if (orderInfo.type === 'boars') {
            const rarity = BoarUtils.findRarity(orderInfo.id, this.config);
            rarityColor = colorConfig['rarity' + rarity[0]];
            isSpecial = rarity[1].name === 'Special' && rarity[0] !== 0;
        }

        const underlay = pathConfig.otherAssets + pathConfig.marketOrdersUnderlay;
        const file = pathConfig[orderInfo.type] + (this.config.itemConfigs[orderInfo.type][orderInfo.id].staticFile
            ? this.config.itemConfigs[orderInfo.type][orderInfo.id].staticFile
            : this.config.itemConfigs[orderInfo.type][orderInfo.id].file);

        const mediumFont = `${nums.fontMedium}px ${strConfig.fontName}`;
        const smallMediumFont = `${nums.fontSmallMedium}px ${strConfig.fontName}`;

        const canvas = Canvas.createCanvas(...nums.marketSize);
        const ctx = canvas.getContext('2d');

        ctx.drawImage(await Canvas.loadImage(underlay), ...nums.originPos);

        ctx.drawImage(await Canvas.loadImage(file), 25, 395, 780, 780);

        CanvasUtils.drawText(
            ctx, 'Buying: %@', [415, 308], mediumFont, 'center', colorConfig.font, 740, true,
            this.config.itemConfigs[orderInfo.type][orderInfo.id].name + (isSpecial
                ? ' #' + orderInfo.data.editions[0]
                : ''),
            rarityColor
        );

        CanvasUtils.drawText(
            ctx, 'Listed ' + moment(orderInfo.data.listTime).fromNow(), [415, 1302], mediumFont, 'center',
            colorConfig.font, 740, true
        );

        CanvasUtils.drawText(ctx, 'Price per Unit', [1348, 559], mediumFont, 'center', colorConfig.font);
        CanvasUtils.drawText(
            ctx, '%@' + orderInfo.data.price.toLocaleString(), [1348, 630], smallMediumFont, 'center',
            colorConfig.font, undefined, false, '$', colorConfig.bucks
        );

        CanvasUtils.drawText(ctx, 'Amount Filled', [1348, 765], mediumFont, 'center', colorConfig.font);
        CanvasUtils.drawText(
            ctx, orderInfo.data.filledAmount.toLocaleString() + '/' + orderInfo.data.num.toLocaleString(),
            [1348, 836], smallMediumFont, 'center', colorConfig.font
        );

        CanvasUtils.drawText(ctx, 'Items/Bucks to Claim', [1348, 971], mediumFont, 'center', colorConfig.font);
        CanvasUtils.drawText(ctx, claimStr, [1348, 1042], smallMediumFont, 'center', colorConfig.font);

        return new AttachmentBuilder(canvas.toBuffer(), { name: `${strConfig.imageName}.png` });
    }
}