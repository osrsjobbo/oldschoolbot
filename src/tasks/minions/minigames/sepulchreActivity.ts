import { Bank } from 'oldschooljs';
import { GrandHallowedCoffin } from 'oldschooljs/dist/simulation/misc/GrandHallowedCoffin';

import { userHasFlappy } from '../../../lib/invention/inventions';
import { openCoffin, sepulchreFloors } from '../../../lib/minions/data/sepulchre';
import { trackLoot } from '../../../lib/settings/prisma';
import { incrementMinigameScore } from '../../../lib/settings/settings';
import { SkillsEnum } from '../../../lib/skilling/types';
import { SepulchreActivityTaskOptions } from '../../../lib/types/minions';
import { roll, skillingPetDropRate } from '../../../lib/util';
import { handleTripFinish } from '../../../lib/util/handleTripFinish';
import { makeBankImage } from '../../../lib/util/makeBankImage';

export const sepulchreTask: MinionTask = {
	type: 'Sepulchre',
	async run(data: SepulchreActivityTaskOptions) {
		const { channelID, quantity, floors, userID, duration } = data;
		const user = await mUserFetch(userID);
		await incrementMinigameScore(userID, 'sepulchre', quantity);

		const completedFloors = sepulchreFloors.filter(fl => floors.includes(fl.number));
		const loot = new Bank();
		let agilityXP = 0;
		let thievingXP = 0;
		let numCoffinsOpened = 0;

		for (let i = 0; i < quantity; i++) {
			for (const floor of completedFloors) {
				if (floor.number >= 5) {
					loot.add(GrandHallowedCoffin.roll(), { 5: 1, 6: 2, 7: 3 }[floor.number] ?? 1);
				}

				const { petDropRate } = skillingPetDropRate(user, SkillsEnum.Agility, floor.petChance);

				const numCoffinsToOpen = 1;
				numCoffinsOpened += numCoffinsToOpen;
				for (let i = 0; i < numCoffinsToOpen; i++) {
					loot.add(openCoffin(floor.number, user));
				}
				if (roll(petDropRate)) {
					loot.add('Giant squirrel');
				}
				agilityXP += floor.xp;
				thievingXP = 200 * numCoffinsOpened;
			}
		}

		const flappyRes = await userHasFlappy({ user, duration });
		if (flappyRes.shouldGiveBoost) {
			loot.multiply(2);
		}

		const { previousCL, itemsAdded } = await transactItems({
			userID: user.id,
			collectionLog: true,
			itemsToAdd: loot
		});

		let xpRes = await user.addXP({
			skillName: SkillsEnum.Agility,
			amount: agilityXP,
			duration
		});

		let thievingXpRes = await user.addXP({
			skillName: SkillsEnum.Thieving,
			amount: thievingXP,
			duration
		});

		await trackLoot({
			loot: itemsAdded,
			id: 'sepulchre',
			type: 'Minigame',
			changeType: 'loot',
			duration: data.duration,
			kc: quantity
		});

		let str = `${user}, ${user.minionName} finished doing the Hallowed Sepulchre ${quantity}x times (floor ${
			floors[0]
		}-${floors[floors.length - 1]}), and opened ${numCoffinsOpened}x coffins.\n\n${xpRes}\n${thievingXpRes}`;

		str += `\n${flappyRes.userMsg}`;

		const image = await makeBankImage({
			bank: itemsAdded,
			title: `Loot From ${quantity}x Hallowed Sepulchre`,
			user,
			previousCL
		});

		handleTripFinish(
			user,
			channelID,
			str,
			['minigames', { sepulchre: { start: {} } }, true],
			image.file.attachment,
			data,
			itemsAdded
		);
	}
};
