import {OutcomeConfig} from './OutcomeConfig';

/**
 * {@link ItemConfig ItemConfig.ts}
 *
 * Stores an item configuration for a bot instance.
 *
 * @license {@link http://www.apache.org/licenses/ Apache-2.0}
 * @copyright WeslayCodes 2023
 */
export class ItemConfig {
    public readonly name = '' as string;
    public readonly pluralName = '' as string;
    public readonly description = '' as string;
    public readonly file = '' as string;
    public readonly staticFile?: string;
    public readonly isSB = false as boolean;
    public readonly blacklisted = false as boolean;
    public readonly rewardAmt?: number;
    public readonly outcomes?: OutcomeConfig[];
}