// ════════════════════════════════════════════════════════════════
//  TASK 3 — Linked Brushing (PCP ↔ SPLOM)
//  Combines Task 1 (PCP) + Task 2 (SPLOM)
//  Linked via CustomEvents
// ════════════════════════════════════════════════════════════════

// ── Attributes for PCP (Task 1) ──────────────────────────────
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

// ── Attributes for SPLOM (Task 2) ────────────────────────────
const metrics = [
    "id",
    "appearance",
    "mins_played"
];

// ════════════════════════════════════════════════════════════════
//  LINKED BRUSHING — CustomEvent broadcast
//  Both views fire "selectionChanged" when their brush updates.
//  The "source" tag stops infinite loops between the two views.
// ════════════════════════════════════════════════════════════════
function broadcast(selectedLabels, source) {
    window.dispatchEvent(new CustomEvent("selectionChanged", {
        detail: { labels: selectedLabels, source: source }
    }));
}

// ════════════════════════════════════════════════════════════════
//  LOAD DATA ONCE — draw both views
// ════════════════════════════════════════════════════════════════
d3.json("data/football.json").then(function (data) {

    const players = data.nodes ? data.nodes : data;

    drawPCP(players);    // Task 1
    drawSPLOM(players);  // Task 2

}).catch(function (error) {
    console.error("Error loading data:", error);
    document.getElementById("pcp-container").innerHTML =
        "<p style='color:red;padding:20px'>Could not load data/football.json — make sure your local server is running.</p>";
});

// ════════════════════════════════════════════════════════════════
//  TASK 1 — Vertical Parallel Coordinates Plot
// ════════════════════════════════════════════════════════════════
function drawPCP(data) {

    const margin = { top: 60, right: 50, bottom: 40, left: 50 };
    const W = (window.innerWidth / 2) - 40;
    const H = window.innerHeight - 150;
    const iW = W - margin.left - margin.right;
    const iH = H - margin.top - margin.bottom;

    d3.select("#pcp-container").selectAll("svg").remove();

    const svg = d3.select("#pcp-container")
        .append("svg")
        .attr("width", W)
        .attr("height", H);

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left}, ${margin.top})`);

    // X scale: positions each vertical axis across the width
    const xScale = d3.scalePoint()
        .domain(ATTRS)
        .range([0, iW])
        .padding(0.1);

    // Y scales: one per attribute
    const yScales = {};
    ATTRS.forEach(function (attr) {
        const values = data.map(d => +d[attr]).filter(v => !isNaN(v));
        const extent = d3.extent(values);
        const finalExtent = (extent[0] === undefined || extent[1] === undefined) ? [0, 100] : extent;
        yScales[attr] = d3.scaleLinear()
            .domain(finalExtent)
            .nice()
            .range([iH, 0]);
    });

    // Line generator
    function polyline(d) {
        const points = [];
        for (const attr of ATTRS) {
            const val = +d[attr];
            if (!isNaN(val)) points.push([xScale(attr), yScales[attr](val)]);
        }
        return points.length > 0 ? d3.line()(points) : null;
    }

    // Draw player lines
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

    // Draw vertical axes + brushes
    ATTRS.forEach(function (attr) {

        const axisG = g.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(${xScale(attr)}, 0)`);

        axisG.call(d3.axisLeft(yScales[attr]).ticks(6).tickSize(4));

        axisG.append("text")
            .attr("class", "axis-label")
            .attr("y", -22)
            .style("text-anchor", "middle")
            .style("fill", "#2c3e50")
            .style("font-size", "10px")
            .style("font-weight", "bold")
            .text(attr.replace(/_/g, " ").toUpperCase());

        const brush = d3.brushY()
            .extent([[-8, 0], [8, iH]])
            .on("brush end", updateHighlight);

        const brushG = axisG.append("g")
            .attr("class", "brush")
            .call(brush);

        brushG.selectAll(".overlay")
            .style("cursor", "ns-resize")
            .attr("x", -15)
            .attr("width", 30);

        brushG.selectAll(".selection")
            .style("fill", "#34495e")
            .style("fill-opacity", "0.25")
            .style("stroke", "#2c3e50")
            .style("stroke-width", "1px")
            .style("stroke-dasharray", "2,2");
    });

    // ── PCP brush update + broadcast ─────────────────────────────
    function updateHighlight() {
        const active = {};
        g.selectAll(".brush").each(function (_, i) {
            const sel = d3.brushSelection(this);
            if (sel) active[ATTRS[i]] = sel;
        });

        // No brush active → reset all lines
        if (Object.keys(active).length === 0) {
            lines.style("stroke", "#2a75d3")
                .style("stroke-opacity", 0.4)
                .style("stroke-width", "1.5px");
            broadcast([], "pcp");   // tell SPLOM: clear selection
            return;
        }

        // Find matching players
        const selectedLabels = [];
        lines.each(function (d) {
            const isMatched = Object.entries(active).every(function ([attr, [y0, y1]]) {
                const val = +d[attr];
                if (isNaN(val)) return false;
                const py = yScales[attr](val);
                return py >= y0 && py <= y1;
            });

            d3.select(this)
                .style("stroke", isMatched ? "#e65c00" : "#cfd8dc")
                .style("stroke-opacity", isMatched ? 0.95 : 0.04)
                .style("stroke-width", isMatched ? "2.5px" : "1px");

            if (isMatched) selectedLabels.push(d.label);
        });

        broadcast(selectedLabels, "pcp");   // ← fires CustomEvent to SPLOM
    }

    // ── Listen for selections coming FROM SPLOM ───────────────────
    window.addEventListener("selectionChanged", function (e) {
        if (e.detail.source === "pcp") return;  // ignore own events

        const labels = e.detail.labels;

        if (labels.length === 0) {
            lines.style("stroke", "#2a75d3")
                .style("stroke-opacity", 0.4)
                .style("stroke-width", "1.5px");
            return;
        }

        lines.each(function (d) {
            const isMatched = labels.includes(d.label);
            d3.select(this)
                .style("stroke", isMatched ? "#e65c00" : "#cfd8dc")
                .style("stroke-opacity", isMatched ? 0.95 : 0.04)
                .style("stroke-width", isMatched ? "2.5px" : "1px");
        });
    });
}

// ════════════════════════════════════════════════════════════════
//  TASK 2 — Scatterplot Matrix (inverted diagonal)
// ════════════════════════════════════════════════════════════════
function drawSPLOM(nodes) {

    const size = 240;
    const padding = 40;

    const x = {};
    const y = {};

    metrics.forEach(metric => {
        x[metric] = d3.scaleLinear()
            .domain(d3.extent(nodes, d => +d[metric]))
            .nice()
            .range([padding, size - padding]);

        y[metric] = d3.scaleLinear()
            .domain(d3.extent(nodes, d => +d[metric]))
            .nice()
            .range([size - padding, padding]);
    });

    const svg = d3.select("#splom-container")
        .append("svg")
        .attr("width", size * metrics.length + 120)
        .attr("height", size * metrics.length + 120)
        .append("g")
        .attr("transform", "translate(60,60)");

    const tooltip = d3.select("body")
        .append("div")
        .style("position", "absolute")
        .style("background", "white")
        .style("padding", "8px")
        .style("border", "1px solid #ccc")
        .style("border-radius", "4px")
        .style("display", "none");

    let activeBrush = null;

    const brush = d3.brush()
        .extent([[padding, padding], [size - padding, size - padding]])
        .on("start", brushStarted)
        .on("brush", brushed)
        .on("end", brushEnded);

    // Clip paths
    svg.append("defs")
        .selectAll("clipPath")
        .data(metrics)
        .enter()
        .append("clipPath")
        .attr("id", (d, i) => `clip-${i}`)
        .append("rect")
        .attr("x", padding - 6)
        .attr("y", padding - 6)
        .attr("width", size - padding * 2 + 12)
        .attr("height", size - padding * 2 + 12);

    const cell = svg.selectAll(".cell")
        .data(cross(metrics, metrics))
        .enter()
        .append("g")
        .attr("class", "cell")
        .attr("transform", d => `translate(${d.i * size}, ${(metrics.length - 1 - d.j) * size})`);

    cell.append("rect")
        .attr("x", padding)
        .attr("y", padding)
        .attr("width", size - padding * 2)
        .attr("height", size - padding * 2)
        .attr("fill", "none")
        .attr("stroke", "#cccccc");

    cell.each(function (d) {

        const g = d3.select(this);

        // Axes
        if (d.j === 0) {
            g.append("g")
                .attr("transform", `translate(0,${size - padding})`)
                .call(d3.axisBottom(x[d.x]).ticks(5));
        }
        if (d.i === 0) {
            g.append("g")
                .attr("transform", `translate(${padding},0)`)
                .call(d3.axisLeft(y[d.y]).ticks(5));
        }

        // Plot area
        const plot = g.append("g")
            .attr("clip-path", `url(#clip-${d.i})`);

        plot.selectAll("circle")
            .data(nodes)
            .enter()
            .append("circle")
            .attr("cx", p => x[d.x](p[d.x]))
            .attr("cy", p => y[d.y](p[d.y]))
            .attr("r", 5)
            .attr("fill", "steelblue")
            .attr("opacity", 0.7)
            .on("mouseover", function (event, p) {
                tooltip.style("display", "block")
                    .html(`<strong>${p.label}</strong><br>
                           ID: ${p.id}<br>
                           Appearance: ${p.appearance}<br>
                           Minutes Played: ${p.mins_played}`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 20) + "px");
            })
            .on("mouseout", function () {
                tooltip.style("display", "none");
            });

        // Brush
        g.append("g").call(brush);

        // Labels on inverted diagonal: col + row === metrics.length - 1
        if (d.i + d.j === metrics.length - 1) {
            g.append("text")
                .attr("x", padding + 10)
                .attr("y", padding + 5)
                .style("font-size", "16px")
                .style("font-weight", "bold")
                .text(d.x);
        }

        g.datum(d);
    });

    // ── SPLOM brush functions + broadcast ─────────────────────────
    function brushStarted() {
        if (activeBrush !== this) {
            d3.select(activeBrush).call(brush.move, null);
            activeBrush = this;
        }
    }

    function brushed(event, d) {
        if (!event.selection) return;

        const [[x0, y0], [x1, y1]] = event.selection;
        const selectedLabels = [];

        nodes.forEach(p => {
            const px = x[d.x](p[d.x]);
            const py = y[d.y](p[d.y]);
            if (px >= x0 && px <= x1 && py >= y0 && py <= y1) {
                selectedLabels.push(p.label);
            }
        });

        // Highlight dots in SPLOM
        svg.selectAll("circle")
            .attr("opacity", p => selectedLabels.includes(p.label) ? 1 : 0.08)
            .attr("stroke", p => selectedLabels.includes(p.label) ? "black" : "none")
            .attr("stroke-width", p => selectedLabels.includes(p.label) ? 2 : 0);

        broadcast(selectedLabels, "splom");   // ← fires CustomEvent to PCP
    }

    function brushEnded(event) {
        if (event.selection) return;

        // Brush cleared → reset dots
        svg.selectAll("circle")
            .attr("opacity", 0.7)
            .attr("stroke", "none");

        broadcast([], "splom");   // tell PCP: clear selection
    }

    // ── Listen for selections coming FROM PCP ─────────────────────
    window.addEventListener("selectionChanged", function (e) {
        if (e.detail.source === "splom") return;  // ignore own events

        const labels = e.detail.labels;

        if (labels.length === 0) {
            svg.selectAll("circle")
                .attr("opacity", 0.7)
                .attr("stroke", "none");
            return;
        }

        svg.selectAll("circle")
            .attr("opacity", p => labels.includes(p.label) ? 1 : 0.08)
            .attr("stroke", p => labels.includes(p.label) ? "black" : "none")
            .attr("stroke-width", p => labels.includes(p.label) ? 2 : 0);
    });

    // ── cross() helper: builds cell data with inverted diagonal ───
    function cross(a, b) {
        const result = [];
        for (let i = 0; i < a.length; i++) {
            for (let j = 0; j < b.length; j++) {
                let xMetric = a[i];
                let yMetric = b[j];

                // Inverted diagonal swap (/ instead of \)
                if (i === 0 && j === 0) {
                    xMetric = "mins_played";
                    yMetric = "mins_played";
                } else if (i === 2 && j === 2) {
                    xMetric = "id";
                    yMetric = "id";
                }

                result.push({ x: xMetric, i: i, y: yMetric, j: j });
            }
        }
        return result;
    }
}
