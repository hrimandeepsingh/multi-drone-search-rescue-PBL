# Coordinator Module – Multi-Drone Search and Rescue System

## 1. Overview
The Coordinator Module acts as the central control unit of the Multi-Drone Search and Rescue System. It manages UAV selection, automatic mission allocation, dynamic event handling, and user interaction through a menu-driven interface.

## 2. Key Responsibilities

### A. UAV Selection
- Identifies suitable UAVs for assigned rescue missions.
- Considers drone availability, current location, and battery level.
- Selects an appropriate UAV based on mission requirements.

### B. Automatic UAV Allocation
- Automatically assigns available UAVs to rescue missions.
- Uses mission priority and UAV suitability as allocation criteria.
- Helps distribute tasks efficiently among multiple drones.

### C. Dynamic Event Handling
- Handles unexpected events during mission execution.
- Supports scenarios such as UAV failure and blocked paths.
- Updates task allocation when the current mission conditions change.
- Helps maintain mission continuity through reassignment.

### D. Menu-Driven Interface
- Provides an interactive interface for system operations.
- Allows users to access UAV selection and allocation functionalities.
- Supports dynamic event operations and system monitoring.
- Makes the simulation easier to operate and understand.

## 3. Coordinator Workflow
1. Receive rescue mission details.
2. Check available UAVs and their current status.
3. Select a suitable UAV.
4. Automatically allocate the mission.
5. Monitor mission execution.
6. Handle dynamic events and reassignment when required.

## 4. Expected Outcome
The Coordinator Module provides centralized management of multiple UAVs and rescue missions. It aims to improve resource utilization, mission allocation, adaptability, and overall coordination within the search and rescue simulation.

## 5. Technical Contribution
**Module:** Coordinator

**Contribution Areas:**
- UAV Selection
- Automatic UAV Allocation
- Dynamic Event Handling
- Menu-Driven System Interface
