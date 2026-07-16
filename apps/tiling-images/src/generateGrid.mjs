import fs from 'fs';

function generateRandomGrid(levels) {
    if (levels === 0) {
        return {
			"1": null,
			"2": null,
			"3": null,
			"4": null
		};
    } else {
        const grid = {};
        for (let i = 1; i <= 4; i++) {
			if (Math.random() < 0.25) {
				grid[i.toString()] = null;
			} else {
				grid[i.toString()] = generateRandomGrid(levels - 1);
			}
        }
        return grid;
    }
}

function countNullFromGrid(grid) {
	let count = 0;
	if (grid["1"] !== null) {
		count += countNullFromGrid(grid["1"]);
	} else {
		count++;
	}
	if (grid["2"] !== null) {
		count += countNullFromGrid(grid["2"]);
	} else {
		count++;
	}
	if (grid["3"] !== null) {
		count += countNullFromGrid(grid["3"]);
	} else {
		count++;
	}
	if (grid["4"] !== null) {
		count += countNullFromGrid(grid["4"]);
	} else {
		count++;
	}
	return count;
}

const levels = 6; // Adjust the number of levels as needed
const minSize = 4900;
const maxSize = 5100;

let totalCount = 0;
let totalRuns = 0;
while (true) {
	const grid = generateRandomGrid(levels);
	const count = countNullFromGrid(JSON.parse(JSON.stringify(grid)));
	totalCount += count;
	totalRuns++;
	console.log(`Average null elements: ${totalCount / totalRuns}`);
	if (count >= minSize && count <= maxSize) {
		console.log(`Found grid with ${count} null elements`)
		fs.writeFileSync('./src/app/grid.json', JSON.stringify(grid, null, 2));
		break;
	}
}