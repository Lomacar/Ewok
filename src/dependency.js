    //////////////////////////////////////////////
    //stuff for sorting the component dependencies

    function Graph(nodes,edges) {
        const adjacencyList = this.adjacencyList = new Map();
        const independentNodes = this.independentNodes = new Set(nodes);

        this.nodes = nodes
            
        this.addNode = function (node) {
            adjacencyList.set(node, new Set())
        }
        this.addEdge = function (dependency,dependent) {
            try {
                adjacencyList.get(dependency).add(dependent)
                return true
            } catch (error) {
                console.warn("Invalid edge.")
                return false
            }
        }


        if (nodes && nodes.length) {
            nodes.forEach(this.addNode)
            if (edges && edges.length) {
                edges.forEach(edge => {
                    if (this.addEdge(...edge))
                        independentNodes.delete(edge[1])
                })
            }
        }

        return this
    }

    function topologicalSort (graph) {
        const L = []

        const inDegree = {};
        for (const v of graph.nodes) {
            for (neighbor of graph.adjacencyList.get(v)) {
                inDegree[neighbor] = inDegree[neighbor] + 1 || 1;
            }
        }

        let index = 0
        let queue = new Set(graph.independentNodes)
        while (queue.size) {
            let n = queue.values().next().value
            queue.delete(n)
            L.push(n)
            index++
            graph.adjacencyList.get(n).forEach((m)=>{
                inDegree[m]--
                if (inDegree[m]===0){
                    queue.add(m)
                }
            })

        }

        if (index !== graph.nodes.length) {
            console.warn("Dependecy cycle detected.");
        }

        return L
    }