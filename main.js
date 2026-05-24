
// ════════════════════════════════════════════════════════════════
//   TASK 1 — Vertical Parallel Coordinates Plot
//   main.js
// ════════════════════════════════════════════════════════════════

// Core dataset keys directly present at the root level of your JSON file
const ATTRS = [
    "appearance",
    "mins_played",
    "ball_recovery",
    "clearance_total",
    "duel_aerial_won",
    "pass_accurate",
    "possession",
    "touches"
];

// Load the real soccer dataset then draw the PCP
d3.json("data/football.json").then(function (data) {
    // Extract the array of nodes from the graph layout structure
    const players = data.nodes ? data.nodes : data;
    drawPCP(players);
}).catch(function (error) {
    console.error("Error loading data:", error);
    document.getElementById("pcp-container").innerHTML =
        "<p style='color:red;padding:20px'>Could not load data/football.json — make sure your local server is running.</p>";
});

function drawPCP(data) {
    // ── Dimensions ──────────────────────────────────────────────
    const margin = { top: 60, right: 50, bottom: 40, left: 50 };
    const W = window.innerWidth - 60;
    const H = window.innerHeight - 150;
    const iW = W - margin.left - margin.right;
    const iH = H - margin.top - margin.bottom;

    // Clear any remnants to ensure a clean visual canvas layer
    d3.select("#pcp-container").selectAll("svg").remove();

    const svg = d3.select("#pcp-container")
        .append("svg")
        .attr("width", W)
        .attr("height", H);

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // ── X Scale ─────────────────────────────────────────────────
    const xScale = d3.scalePoint()
        .domain(ATTRS)
        .range([0, iW])
        .padding(0.1);

    // ── Y Scales (One per attribute column) ──────────────────────
    const yScales = {};
    ATTRS.forEach(function (attr) {
        // Safe mapping lookup directly from the flat object root
        const values = data.map(d => +d[attr]).filter(v => !isNaN(v));
        const extent = d3.extent(values);

        // Dynamically scale axes bounds using the actual dataset minimums and maximums
        const finalExtent = (extent[0] === undefined || extent[1] === undefined) ? [0, 100] : extent;

        yScales[attr] = d3.scaleLinear()
            .domain(finalExtent)
            .nice()
            .range([iH, 0]); // High performance statistics scale to the top
    });

    // ── Polyline Generator ───────────────────────────────────────
    function polyline(d) {
        const points = [];
        for (const attr of ATTRS) {
            const val = +d[attr];
            if (!isNaN(val)) {
                points.push([xScale(attr), yScales[attr](val)]);
            }
        }
        return points.length > 0 ? d3.line()(points) : null;
    }

    // ── Draw Player Paths ───────────────────────────────────────
    const lines = g.append("g")
        .attr("class", "lines-group")
        .selectAll("path")
        .data(data)
        .join("path")
        .attr("class", "pcp-line")
        .attr("d", polyline)
        .style("fill", "none")
        .style("stroke", "#2a75d3")
        .style("stroke-opacity", 0.4)
        .style("stroke-width", "1.5px");

    // ── Draw Vertical Axes + Interaction Brushes ──────────────────
    ATTRS.forEach(function (attr) {
        const axisG = g.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(${xScale(attr)}, 0)`);

        axisG.call(d3.axisLeft(yScales[attr]).ticks(6).tickSize(4));

        // Format system names nicely (e.g., "mins_played" -> "MINS PLAYED")
        axisG.append("text")
            .attr("class", "axis-label")
            .attr("y", -22)
            .style("text-anchor", "middle")
            .style("fill", "#2c3e50")
            .style("font-size", "10px")
            .style("font-weight", "bold")
            .text(attr.replace(/_/g, " ").toUpperCase());

        // ── THE BRUSH MECHANISM ──────────────────────────────────
        // Initialize a 1D vertical brushing object along the current axis track
        const brush = d3.brushY()
            .extent([[-8, 0], [8, iH]]) // Defines active width window (-8px to +8px) and full height
            .on("brush end", updateHighlight);

        // Append brush element container layer on top of the current axis group
        const brushG = axisG.append("g")
            .attr("class", "brush")
            .call(brush);

        // Enforce explicit hitbox tracking sizes to make overlays easily clickable
        brushG.selectAll(".overlay")
            .style("cursor", "ns-resize")
            .attr("x", -15)
            .attr("width", 30);

        // Enforce visible semi-transparent styles on active selection windows
        brushG.selectAll(".selection")
            .style("fill", "#34495e")
            .style("fill-opacity", "0.25")
            .style("stroke", "#2c3e50")
            .style("stroke-width", "1px")
            .style("stroke-dasharray", "2,2");
    });

    // ── Brushing Filter Update Logic ─────────────────────────────
    function updateHighlight() {
        const active = {};

        // Loop through all brush elements to capture active pixel selection boundaries
        g.selectAll(".brush").each(function (_, i) {
            const sel = d3.brushSelection(this);
            if (sel) active[ATTRS[i]] = sel;
        });

        // Clear Selection Mode: Reset all lines back to normal color state if no brush exists
        if (Object.keys(active).length === 0) {
            lines.style("stroke", "#2a75d3")
                .style("stroke-opacity", 0.4)
                .style("stroke-width", "1.5px");
            return;
        }

        // Active Selection Filtering: Check every player track line against all active filters
        lines.each(function (d) {
            let isMatched = Object.entries(active).every(function ([attr, [y0, y1]]) {
                const val = +d[attr];
                if (isNaN(val)) return false;

                // Map the data metric value to its exact layout Y-pixel placement
                const py = yScales[attr](val);

                // Return true if the line coordinate sits completely inside selection box bounds
                return py >= y0 && py <= y1;
            });

            // Brighten matching player lines; deeply dim out non-matching paths
            d3.select(this)
                .style("stroke", isMatched ? "#e65c00" : "#cfd8dc")
                .style("stroke-opacity", isMatched ? 0.95 : 0.04)
                .style("stroke-width", isMatched ? "2.5px" : "1px");
        });
    }
}