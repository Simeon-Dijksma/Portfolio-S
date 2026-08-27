class GitContributionCalendar {
    constructor(element, options = {}) {
        this.element = element;
        this.endpoint = options.endpoint ?? "/api/github/contributions";
    }

    async load() {
        try {
            const response = await fetch(this.endpoint);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            this.render(data);
        } catch (err) {
            console.error(err);
            this.element.textContent = "Unable to load GitHub contributions.";
        }
    }

    getLastYear(days) {
        const sorted = [...days].sort(
            (a, b) => new Date(a.date) - new Date(b.date)
        );

        return sorted.slice(-365);
    }

    render(data) {
        this.element.innerHTML = "";

        const wrapper = document.createElement("div");
        wrapper.className = "git-calendar";

        const title = document.createElement("div");
        title.className = "git-calendar-title";
        title.textContent = `${data.totalContributions.toLocaleString()} Contributions`;

        wrapper.appendChild(title);

        const scroll = document.createElement("div");
        scroll.className = "git-calendar-scroll";

        const grid = document.createElement("div");
        grid.className = "git-calendar-grid";

        const days = this.getLastYear(data.days);

        days.forEach(day => {
            const cell = document.createElement("div");

            cell.className = `level-${day.level}`;

            cell.title =
`${day.date}
${day.count} contribution${day.count !== 1 ? "s" : ""}`;

            grid.appendChild(cell);
        });

        scroll.appendChild(grid);
        wrapper.appendChild(scroll);

        this.element.appendChild(wrapper);
    }
}

document.querySelectorAll(".git-commits").forEach(element => {
    new GitContributionCalendar(element).load();
});