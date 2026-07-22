const parsedBudgetMin = 880;
console.log(`Starting from \u00b7${new Intl.NumberFormat('en-US').format(Math.max(0, Math.floor(parsedBudgetMin)))}`);

const place_budget_min = 880;
console.log(`From \u00b7${Number(place_budget_min).toLocaleString()}`);
