/**
 * {@link PowerupData PowerupData.ts}
 *
 * Stores data for powerups globally
 *
 * @license {@link http://www.apache.org/licenses/ Apache-2.0}
 * @copyright WeslayCodes 2023
 */

export class PowerupData {
    messagesInfo = {} as Record<string, string[]>;
    failedServers = {} as Record<string, number>;
}