// Multi-UAV Search & Rescue System (updated console version)
// Changes from previous version:
//  - Graph extended to 12 nodes / 20 edges (nodes 1-6 same as before)
//  - Fleet increased to 20 UAVs starting from 4 drone stations
//  - Priority queue ties broken by arrival sequence number
//  - Best UAV ties broken by higher battery
//  - New events: recharge UAV, repair UAV, unblock route
//  - Busy state kept separately from battery/failure state
//  - High priority missions (4-5) are auto-dispatched after every event,
//    low priority missions (1-3) wait in the queue until "Process Pending Missions"

#include <iostream>
#include <vector>
#include <queue>
#include <memory>
#include <map>
#include <string>
#include <algorithm>
#include <limits>

using namespace std;

const int NODES = 12;
const int BATTERY_PER_COST = 10;
const int LOW_BATTERY_LIMIT = 20;
const int AUTO_DISPATCH_PRIORITY = 4;   // priority >= 4 is allocated automatically

const string NODE_NAMES[NODES + 1] = {
    "", "Base Camp", "City Hospital", "School", "Market", "River Bridge", "Village A",
    "Riverside Colony", "Hill Top", "Factory Area", "Railway Station", "Village B", "Dam Site"
};

// UAV CLASS

class UAV {
private:
    string id;
    int location;
    int battery;
    bool busy;
    bool failed;

public:
    UAV(string id, int location, int battery)
        : id(id), location(location), battery(battery),
          busy(false), failed(false) {}

    string getId() const { return id; }
    int getLocation() const { return location; }
    int getBattery() const { return battery; }
    bool isFailed() const { return failed; }
    bool isBusy() const { return busy; }

    bool isAvailable() const {
        return !busy && !failed && battery > LOW_BATTERY_LIMIT;
    }

    void setBusy(bool value) { busy = value; }

    void reduceBattery(int amount) {
        battery = max(0, battery - amount);
    }

    void setBattery(int value) {
        battery = max(0, min(100, value));
    }

    void fail() {
        failed = true;
        busy = false;
    }

    void repair() { failed = false; }

    void setLocation(int newLocation) { location = newLocation; }

    string status() const {
        if (failed) return "FAILED";
        if (busy) return "BUSY";
        if (battery <= LOW_BATTERY_LIMIT) return "LOW BATTERY";
        return "AVAILABLE";
    }

    void display() const {
        cout << "UAV-" << id
             << " | Location: " << location << " (" << NODE_NAMES[location] << ")"
             << " | Battery: " << battery << "%"
             << " | " << status() << '\n';
    }
};

// MISSION CLASS

class Mission {
private:
    string id;
    int destination;
    int priority;
    string type;
    string status;
    string assignedUAV;
    int seq;

public:
    Mission(string id, int destination, int priority, string type, int seq)
        : id(id), destination(destination), priority(priority),
          type(type), status("Pending"), assignedUAV("None"), seq(seq) {}

    string getId() const { return id; }
    int getDestination() const { return destination; }
    int getPriority() const { return priority; }
    string getType() const { return type; }
    string getStatus() const { return status; }
    string getAssignedUAV() const { return assignedUAV; }
    int getSeq() const { return seq; }

    void assignUAV(const string& uav) {
        assignedUAV = uav;
        status = "Assigned";
    }

    void complete() { status = "Completed"; }

    void resetToPending() {
        status = "Pending";
        assignedUAV = "None";
    }

    void display() const {
        cout << id
             << " | Destination: " << destination
             << " | Priority: " << priority
             << " | Type: " << type
             << " | Status: " << status
             << " | UAV: " << assignedUAV << '\n';
    }
};

// MISSION PRIORITY COMPARATOR
// Higher priority first. Same priority -> smaller sequence number (came first).

struct MissionComparator {
    bool operator()(Mission* a, Mission* b) const {
        if (a->getPriority() != b->getPriority())
            return a->getPriority() < b->getPriority();
        return a->getSeq() > b->getSeq();
    }
};

// GRAPH CLASS

class Graph {
private:
    int vertices;
    vector<vector<pair<int, int>>> adj;
    vector<vector<bool>> blocked;

public:
    Graph(int vertices) : vertices(vertices) {
        adj.resize(vertices + 1);
        blocked.resize(vertices + 1, vector<bool>(vertices + 1, false));
    }

    int size() const { return vertices; }

    void addEdge(int u, int v, int weight) {
        if (u < 1 || u > vertices || v < 1 || v > vertices || weight < 0)
            return;

        adj[u].push_back({v, weight});
        adj[v].push_back({u, weight});
    }

    // list of all edges (u < v) so the menu can show them
    vector<pair<int, int>> edgeList() const {
        vector<pair<int, int>> edges;
        for (int u = 1; u <= vertices; u++)
            for (const auto& e : adj[u])
                if (u < e.first)
                    edges.push_back({u, e.first});
        return edges;
    }

    bool isBlocked(int u, int v) const { return blocked[u][v]; }

    bool edgeExists(int u, int v) const {
        if (u < 1 || u > vertices || v < 1 || v > vertices)
            return false;
        for (const auto& edge : adj[u])
            if (edge.first == v)
                return true;
        return false;
    }

    bool blockRoute(int u, int v) {
        if (!edgeExists(u, v))
            return false;

        blocked[u][v] = true;
        blocked[v][u] = true;

        cout << "\n[EVENT] Route " << u << " <-> " << v
             << " has been BLOCKED.\n";
        return true;
    }

    bool unblockRoute(int u, int v) {
        if (!edgeExists(u, v) || !blocked[u][v])
            return false;

        blocked[u][v] = false;
        blocked[v][u] = false;

        cout << "\n[EVENT] Route " << u << " <-> " << v
             << " is OPEN again.\n";
        return true;
    }

    void displayGraph() const {
        cout << "\n========== DISASTER AREA GRAPH ==========\n";

        for (int i = 1; i <= vertices; i++) {
            cout << "Node " << i << " (" << NODE_NAMES[i] << ") -> ";

            for (const auto& edge : adj[i]) {
                int next = edge.first;
                int weight = edge.second;

                cout << next << "(" << weight << ")";
                if (blocked[i][next])
                    cout << "[BLOCKED]";
                cout << "  ";
            }
            cout << '\n';
        }
    }

    bool BFS(int start, int destination) const {
        if (start < 1 || start > vertices ||
            destination < 1 || destination > vertices)
            return false;

        vector<bool> visited(vertices + 1, false);
        queue<int> q;

        q.push(start);
        visited[start] = true;

        while (!q.empty()) {
            int current = q.front();
            q.pop();

            if (current == destination)
                return true;

            for (const auto& edge : adj[current]) {
                int next = edge.first;

                if (!visited[next] && !blocked[current][next]) {
                    visited[next] = true;
                    q.push(next);
                }
            }
        }

        return false;
    }

    pair<int, vector<int>> dijkstra(int source, int destination) const {
        const int INF = numeric_limits<int>::max() / 4;

        if (source < 1 || source > vertices ||
            destination < 1 || destination > vertices)
            return {-1, {}};

        vector<int> distance(vertices + 1, INF);
        vector<int> parent(vertices + 1, -1);

        priority_queue<
            pair<int, int>,
            vector<pair<int, int>>,
            greater<pair<int, int>>
        > pq;

        distance[source] = 0;
        pq.push({0, source});

        while (!pq.empty()) {
            int currentDistance = pq.top().first;
            int current = pq.top().second;
            pq.pop();

            if (currentDistance != distance[current])
                continue;

            for (const auto& edge : adj[current]) {
                int next = edge.first;
                int weight = edge.second;

                if (blocked[current][next])
                    continue;

                if (distance[current] + weight < distance[next]) {
                    distance[next] = distance[current] + weight;
                    parent[next] = current;
                    pq.push({distance[next], next});
                }
            }
        }

        if (distance[destination] == INF)
            return {-1, {}};

        vector<int> path;
        for (int current = destination; current != -1; current = parent[current])
            path.push_back(current);

        reverse(path.begin(), path.end());
        return {distance[destination], path};
    }
};

// COORDINATOR CLASS

class Coordinator {
private:
    Graph& graph;
    vector<UAV> uavs;
    vector<unique_ptr<Mission>> missions;
    priority_queue<Mission*, vector<Mission*>, MissionComparator> missionQueue;
    map<string, string> assignments;
    int nextSeq = 0;

    int findUAVIndex(const string& id) const {
        for (int i = 0; i < static_cast<int>(uavs.size()); i++) {
            if (uavs[i].getId() == id)
                return i;
        }
        return -1;
    }

    bool missionIdExists(const string& id) const {
        for (const auto& mission : missions) {
            if (mission->getId() == id)
                return true;
        }
        return false;
    }

    // eligible = available AND reachable AND battery >= 10 x cost
    // choose lowest cost, tie -> higher battery
    int findBestUAV(int destination) const {
        int bestIndex = -1;
        int bestCost = numeric_limits<int>::max();

        for (int i = 0; i < static_cast<int>(uavs.size()); i++) {
            const UAV& uav = uavs[i];

            if (!uav.isAvailable())
                continue;

            auto route = graph.dijkstra(uav.getLocation(), destination);
            int routeCost = route.first;

            if (routeCost == -1)
                continue;

            int requiredBattery = routeCost * BATTERY_PER_COST;
            if (uav.getBattery() < requiredBattery)
                continue;

            if (routeCost < bestCost ||
                (routeCost == bestCost && uav.getBattery() > uavs[bestIndex].getBattery())) {
                bestCost = routeCost;
                bestIndex = i;
            }
        }

        return bestIndex;
    }

    void printPath(const vector<int>& path) const {
        for (size_t i = 0; i < path.size(); i++) {
            cout << path[i];
            if (i + 1 < path.size())
                cout << " -> ";
        }
    }

    // shows the UAV list and reads a choice, returns index or -1
    int selectUAV(const string& message) {
        displayUAVs();

        if (uavs.empty()) {
            cout << "No UAVs available in the fleet.\n";
            return -1;
        }

        int choice;
        cout << "\n" << message << " (1-" << uavs.size() << "): ";
        if (!(cin >> choice)) {
            handleInputError();
            return -1;
        }

        if (choice < 1 || choice > static_cast<int>(uavs.size())) {
            cout << "Invalid choice.\n";
            return -1;
        }
        return choice - 1;
    }

    bool readNode(const string& message, int& node) {
        cout << message << " (1-" << graph.size() << "): ";
        if (!(cin >> node)) {
            handleInputError();
            return false;
        }
        if (node < 1 || node > graph.size()) {
            cout << "Invalid node.\n";
            return false;
        }
        return true;
    }

public:
    Coordinator(Graph& graph) : graph(graph) {}

    void addUAV(const UAV& uav) {
        uavs.push_back(uav);
    }

    void addMission(const string& id, int destination, int priority, const string& type) {
        if (missionIdExists(id)) {
            cout << "\nMission ID already exists. Please use a unique ID.\n";
            return;
        }

        nextSeq++;
        missions.push_back(make_unique<Mission>(id, destination, priority, type, nextSeq));
        missionQueue.push(missions.back().get());

        cout << "\n[MISSION ADDED] " << id
             << " | Priority: " << priority << '\n';

        // high priority missions are dispatched straight away
        if (priority >= AUTO_DISPATCH_PRIORITY)
            autoAssignPendingMissions();
        else
            cout << "[QUEUED] Waiting in priority queue for batch processing (menu option 1).\n";
    }

    void displayUAVs() const {
        cout << "\n========== UAV FLEET ==========\n";
        for (size_t i = 0; i < uavs.size(); i++) {
            cout << i + 1 << ". ";
            uavs[i].display();
        }
    }

    void displayMissions() const {
        cout << "\n========== MISSIONS ==========\n";

        if (missions.empty()) {
            cout << "No missions have been added yet.\n";
            return;
        }

        for (const auto& mission : missions)
            mission->display();
    }

    void displayQueue() const {
        cout << "\n========== PRIORITY QUEUE (service order) ==========\n";
        auto copy = missionQueue;          // copy so the real queue is not changed
        int pos = 1;
        while (!copy.empty()) {
            Mission* m = copy.top();
            copy.pop();
            if (m->getStatus() != "Pending")
                continue;
            cout << pos++ << ". " << m->getId()
                 << " | Priority: " << m->getPriority()
                 << " | Seq: " << m->getSeq()
                 << " | Node: " << m->getDestination() << '\n';
        }
        if (pos == 1)
            cout << "Queue is empty.\n";
    }

    // missions come out of the heap in priority order.
    // default: only high priority missions (auto-dispatch),
    // minPriority = 1: every pending mission (batch processing)
    void autoAssignPendingMissions(int minPriority = AUTO_DISPATCH_PRIORITY) {
        vector<Mission*> stillWaiting;

        // heap top has the highest priority, so stop once it is lower than minPriority
        while (!missionQueue.empty() && missionQueue.top()->getPriority() >= minPriority) {
            Mission* mission = missionQueue.top();
            missionQueue.pop();

            if (mission->getStatus() != "Pending")
                continue;

            int uavIndex = findBestUAV(mission->getDestination());

            if (uavIndex == -1) {
                cout << "\n[PENDING] " << mission->getId()
                     << " | Priority: " << mission->getPriority()
                     << "\nReason: No suitable UAV currently available.\n";
                stillWaiting.push_back(mission);
                continue;
            }

            UAV& uav = uavs[uavIndex];
            auto route = graph.dijkstra(uav.getLocation(), mission->getDestination());

            int cost = route.first;
            int batteryUsed = cost * BATTERY_PER_COST;

            cout << "\n----------------------------------------\n";
            if (mission->getPriority() >= AUTO_DISPATCH_PRIORITY)
                cout << "[AUTO DISPATCH - HIGH PRIORITY]\n";
            else
                cout << "[BATCH ALLOCATION]\n";
            cout << "Mission: " << mission->getId() << '\n';
            cout << "Priority: " << mission->getPriority() << '\n';
            cout << "Type: " << mission->getType() << '\n';
            cout << "Selected UAV: UAV-" << uav.getId() << '\n';
            cout << "Route: ";
            printPath(route.second);
            cout << "\nRoute Cost: " << cost << '\n';

            uav.reduceBattery(batteryUsed);
            uav.setBusy(true);
            mission->assignUAV(uav.getId());
            assignments[mission->getId()] = uav.getId();

            cout << "Battery Used: " << batteryUsed << "%\n";
            cout << "Remaining Battery: " << uav.getBattery() << "%\n";
            cout << "[SUCCESS] Mission " << mission->getId()
                 << " assigned to UAV-" << uav.getId() << ".\n";
        }

        for (Mission* mission : stillWaiting)
            missionQueue.push(mission);
    }

    void processMissions() {
        cout << "\n========== PROCESSING ALL PENDING MISSIONS ==========\n";
        autoAssignPendingMissions(1);
    }

    void completeMission() {
        displayMissions();

        string missionID;
        cout << "\nEnter Mission ID to complete: ";
        cin >> missionID;

        for (auto& mission : missions) {
            if (mission->getId() != missionID)
                continue;

            if (mission->getStatus() != "Assigned") {
                cout << "\nMission is not currently assigned.\n";
                return;
            }

            string uavID = mission->getAssignedUAV();
            mission->complete();
            assignments.erase(missionID);

            int uavIndex = findUAVIndex(uavID);
            if (uavIndex != -1) {
                uavs[uavIndex].setLocation(mission->getDestination());
                uavs[uavIndex].setBusy(false);
            }

            cout << "\n========== MISSION COMPLETED ==========\n";
            cout << "Mission: " << missionID << '\n';
            cout << "UAV-" << uavID << " is now at node " << mission->getDestination() << ".\n";
            cout << "Checking pending missions...\n";
            autoAssignPendingMissions();
            return;
        }

        cout << "\nMission not found.\n";
    }

    void lowBatteryEvent() {
        int index = selectUAV("Select UAV number");
        if (index == -1)
            return;

        int battery;
        cout << "Enter new battery level (0-100): ";
        if (!(cin >> battery)) {
            handleInputError();
            return;
        }

        if (battery < 0 || battery > 100) {
            cout << "Invalid battery value.\n";
            return;
        }

        uavs[index].setBattery(battery);
        cout << "\n[EVENT] UAV-" << uavs[index].getId()
             << " battery changed to " << battery << "%.\n";

        if (battery <= LOW_BATTERY_LIMIT)
            cout << "[WARNING] UAV entered LOW BATTERY state.\n";

        autoAssignPendingMissions();
    }

    void rechargeEvent() {
        int index = selectUAV("Select UAV number to recharge");
        if (index == -1)
            return;

        uavs[index].setBattery(100);
        cout << "\n[RECHARGE] UAV-" << uavs[index].getId() << " recharged to 100%.\n";
        autoAssignPendingMissions();
    }

    void failureEvent() {
        int index = selectUAV("Select UAV number to fail");
        if (index == -1)
            return;

        string failedID = uavs[index].getId();
        uavs[index].fail();

        for (auto& mission : missions) {
            if (mission->getAssignedUAV() == failedID &&
                mission->getStatus() == "Assigned") {
                cout << "\n[ALERT] Mission " << mission->getId()
                     << " affected by UAV failure.\n";

                mission->resetToPending();
                assignments.erase(mission->getId());
                missionQueue.push(mission.get());

                cout << "[SYSTEM] Mission returned to priority queue.\n";
            }
        }

        cout << "\n[EVENT] UAV-" << failedID << " has FAILED.\n";
        autoAssignPendingMissions();
    }

    void repairEvent() {
        int index = selectUAV("Select UAV number to repair");
        if (index == -1)
            return;

        if (!uavs[index].isFailed()) {
            cout << "UAV is not in failed state.\n";
            return;
        }

        uavs[index].repair();
        cout << "\n[REPAIR] UAV-" << uavs[index].getId() << " is back in the fleet.\n";
        autoAssignPendingMissions();
    }

    // block = true to block, false to open again
    void routeEvent(bool block) {
        vector<pair<int, int>> edges = graph.edgeList();

        cout << "\n========== ROUTES ==========\n";
        for (size_t i = 0; i < edges.size(); i++) {
            cout << i + 1 << ". " << edges[i].first << " <-> " << edges[i].second;
            if (graph.isBlocked(edges[i].first, edges[i].second))
                cout << " [BLOCKED]";
            cout << '\n';
        }

        int choice;
        cout << "\nEnter route number to " << (block ? "block" : "open") << ": ";
        if (!(cin >> choice)) {
            handleInputError();
            return;
        }

        if (choice < 1 || choice > static_cast<int>(edges.size())) {
            cout << "Invalid route.\n";
            return;
        }

        int u = edges[choice - 1].first, v = edges[choice - 1].second;
        bool done = block ? graph.blockRoute(u, v) : graph.unblockRoute(u, v);

        if (done)
            cout << "[SYSTEM] Route planning updated.\n";
        else
            cout << "Nothing changed for this route.\n";

        autoAssignPendingMissions();
    }

    void addUrgentMission() {
        string id, type;
        int destination;

        cout << "\nEnter urgent mission ID: ";
        cin >> id;

        if (!readNode("Enter destination node", destination))
            return;

        cin.ignore(numeric_limits<streamsize>::max(), '\n');
        cout << "Enter mission type: ";
        getline(cin, type);

        cout << "\n[URGENT] Mission " << id
             << " inserted with Priority 5. Checking UAV availability...\n";
        addMission(id, destination, 5, type);
    }

    void showShortestRoute() {
        int source, destination;

        cout << '\n';
        if (!readNode("Enter source node", source))
            return;
        if (!readNode("Enter destination node", destination))
            return;

        if (!graph.BFS(source, destination)) {
            cout << "\nBFS: Destination is NOT reachable.\n";
            return;
        }

        cout << "\nBFS: Destination is reachable.\n";
        auto result = graph.dijkstra(source, destination);

        cout << "Dijkstra Shortest Path: ";
        printPath(result.second);
        cout << "\nTotal Cost: " << result.first
             << " | Battery Needed: " << result.first * BATTERY_PER_COST << "%\n";
    }

    static void handleInputError() {
        cout << "\nInvalid input. Please enter a number and try again.\n";
        cin.clear();
        cin.ignore(numeric_limits<streamsize>::max(), '\n');
    }

    void menu() {
        int choice = -1;

        do {
            cout << "\n\n========== DYNAMIC EVENT MENU ==========\n";
            cout << "1. Process Pending Missions\n";
            cout << "2. Simulate Low Battery\n";
            cout << "3. Simulate UAV Failure\n";
            cout << "4. Block a Route\n";
            cout << "5. Add Urgent Mission\n";
            cout << "6. Show Shortest Route\n";
            cout << "7. Show UAV Status\n";
            cout << "8. Show Mission Status\n";
            cout << "9. Show Graph\n";
            cout << "10. Complete Mission\n";
            cout << "11. Show Priority Queue\n";
            cout << "12. Recharge UAV\n";
            cout << "13. Repair UAV\n";
            cout << "14. Open a Blocked Route\n";
            cout << "0. Exit\n";
            cout << "========================================\n";
            cout << "Enter your choice: " << flush;

            if (!(cin >> choice)) {
                handleInputError();
                continue;
            }

            switch (choice) {
                case 1: processMissions(); break;
                case 2: lowBatteryEvent(); break;
                case 3: failureEvent(); break;
                case 4: routeEvent(true); break;
                case 5: addUrgentMission(); break;
                case 6: showShortestRoute(); break;
                case 7: displayUAVs(); break;
                case 8: displayMissions(); break;
                case 9: graph.displayGraph(); break;
                case 10: completeMission(); break;
                case 11: displayQueue(); break;
                case 12: rechargeEvent(); break;
                case 13: repairEvent(); break;
                case 14: routeEvent(false); break;
                case 0: cout << "\nSystem shutting down...\n"; break;
                default: cout << "\nInvalid choice. Please select 0-14.\n";
            }
        } while (choice != 0);
    }
};

// MAIN FUNCTION

int main() {
    cout << "\n========== MULTI-DRONE SEARCH & RESCUE SYSTEM ==========\n";

    Graph graph(NODES);
    // original 6-node area
    graph.addEdge(1, 2, 4);
    graph.addEdge(1, 3, 3);
    graph.addEdge(2, 4, 2);
    graph.addEdge(3, 4, 1);
    graph.addEdge(3, 5, 5);
    graph.addEdge(4, 5, 2);
    graph.addEdge(4, 6, 4);
    graph.addEdge(5, 6, 1);
    // extended area
    graph.addEdge(6, 7, 2);
    graph.addEdge(5, 8, 3);
    graph.addEdge(7, 8, 2);
    graph.addEdge(2, 9, 3);
    graph.addEdge(9, 10, 2);
    graph.addEdge(4, 10, 3);
    graph.addEdge(10, 11, 2);
    graph.addEdge(6, 10, 3);
    graph.addEdge(7, 11, 3);
    graph.addEdge(11, 12, 2);
    graph.addEdge(8, 12, 4);
    graph.addEdge(7, 12, 3);

    Coordinator coordinator(graph);

    // 20 UAVs at 4 drone stations: nodes 1, 4, 10, 7
    coordinator.addUAV(UAV("A", 1, 100));
    coordinator.addUAV(UAV("B", 1, 90));
    coordinator.addUAV(UAV("C", 1, 85));
    coordinator.addUAV(UAV("D", 1, 95));
    coordinator.addUAV(UAV("E", 1, 70));
    coordinator.addUAV(UAV("F", 4, 90));
    coordinator.addUAV(UAV("G", 4, 75));
    coordinator.addUAV(UAV("H", 4, 60));
    coordinator.addUAV(UAV("I", 4, 95));
    coordinator.addUAV(UAV("J", 4, 85));
    coordinator.addUAV(UAV("K", 10, 65));
    coordinator.addUAV(UAV("L", 10, 80));
    coordinator.addUAV(UAV("M", 10, 90));
    coordinator.addUAV(UAV("N", 10, 100));
    coordinator.addUAV(UAV("O", 10, 55));
    coordinator.addUAV(UAV("P", 7, 75));
    coordinator.addUAV(UAV("Q", 7, 90));
    coordinator.addUAV(UAV("R", 7, 80));
    coordinator.addUAV(UAV("S", 7, 45));
    coordinator.addUAV(UAV("T", 7, 95));

    graph.displayGraph();
    coordinator.displayUAVs();

    int numberOfMissions;
    cout << "\n========== MISSION INITIALIZATION ==========\n";
    cout << "Enter number of missions: " << flush;

    if (!(cin >> numberOfMissions)) {
        cout << "Invalid input. Please run the program again and enter a number.\n";
        return 1;
    }

    for (int i = 0; i < numberOfMissions; i++) {
        string id, type;
        int destination, priority;

        cout << "\nMission " << i + 1 << '\n';
        cout << "Enter Mission ID: ";
        cin >> id;

        cout << "Enter Destination Node (1-" << NODES << "): ";
        if (!(cin >> destination) || destination < 1 || destination > NODES) {
            cout << "Invalid destination. Please restart the program.\n";
            return 1;
        }

        cout << "Enter Priority (1-5): ";
        if (!(cin >> priority) || priority < 1 || priority > 5) {
            cout << "Priority must be between 1 and 5. Please restart the program.\n";
            return 1;
        }

        cin.ignore(numeric_limits<streamsize>::max(), '\n');
        cout << "Enter Mission Type: ";
        getline(cin, type);

        coordinator.addMission(id, destination, priority, type);
    }

    coordinator.displayMissions();
    coordinator.displayQueue();

    cout << "\nHigh priority missions were auto-dispatched. Use option 1 to process the rest.\n";

    coordinator.menu();
    return 0;
}
