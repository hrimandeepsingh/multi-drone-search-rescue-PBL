# Coordinator Module – Workflow and System Operations

## 1. Introduction

The Coordinator Module serves as the central management component of the Multi-Drone Search and Rescue System. It is responsible for selecting suitable UAVs, automatically allocating rescue missions, managing dynamic events, and providing a menu-driven interface for user interaction.

The module ensures efficient coordination between available drones and rescue missions while adapting to changing operational conditions.

## 2. Coordinator Workflow

### Step 1: Mission Input
- Receive rescue mission details from the user.
- Identify mission location and priority.
- Store the mission information for processing.

### Step 2: UAV Status Evaluation
- Retrieve information about available UAVs.
- Check battery levels and current locations.
- Identify UAVs that are available for assignment.
- Exclude UAVs that are unavailable or unsuitable for the mission.

### Step 3: UAV Selection
- Evaluate available UAVs based on their suitability.
- Consider battery capacity, distance from the mission location, and availability.
- Select the most appropriate UAV for the rescue mission.

### Step 4: Automatic Mission Allocation
- Assign the selected UAV to the corresponding mission.
- Update the UAV's availability status.
- Maintain coordination between multiple missions and UAVs.
- Consider mission priority during allocation.

### Step 5: Mission Monitoring
- Monitor the status of assigned UAVs.
- Track mission progress and UAV availability.
- Identify unexpected changes during mission execution.

### Step 6: Dynamic Event Handling
The Coordinator responds to unexpected events, including:

- **UAV Failure:** Identify an unavailable UAV and initiate reassignment when possible.
- **Blocked Path:** Account for route changes and support alternative mission planning.
- **Battery Constraints:** Identify UAVs that cannot safely continue a mission.
- **Mission Updates:** Adjust allocations when mission requirements or priorities change.

### Step 7: Dynamic Reallocation
- Identify missions affected by unexpected events.
- Evaluate the remaining available UAVs.
- Select a suitable replacement UAV when possible.
- Update mission assignments and UAV availability.

### Step 8: Menu-Driven Interaction
The menu provides access to different coordinator operations, such as:

1. Display available UAVs.
2. Select a UAV.
3. Automatically allocate missions.
4. Simulate dynamic events.
5. Display mission and UAV status.
6. Exit the system.

## 3. Overall Workflow

Mission Input  
↓  
UAV Status Evaluation  
↓  
UAV Selection  
↓  
Automatic Mission Allocation  
↓  
Mission Execution and Monitoring  
↓  
Dynamic Event Detection  
↓  
Dynamic Reallocation (if required)  
↓  
Updated Mission Status

## 4. Expected Outcomes

- Efficient utilization of available UAV resources.
- Priority-based rescue mission allocation.
- Improved coordination among multiple drones.
- Adaptability to unexpected mission conditions.
- Simplified interaction through a menu-driven interface.

## 5. Conclusion

The Coordinator Module provides centralized control over UAV selection and rescue mission allocation. By incorporating dynamic event handling and interactive menu operations, it supports an adaptable and organized multi-drone search and rescue simulation.
