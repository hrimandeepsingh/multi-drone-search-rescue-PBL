# Coordinator Module – Test Cases

## 1. Introduction

This document describes the test cases designed to validate the Coordinator Module of the Multi-Drone Search and Rescue System.

The test cases focus on UAV selection, automatic mission allocation, dynamic event handling, and menu-driven operations.

## 2. Test Cases

| Test ID | Module | Test Scenario | Expected Result |
|---|---|---|---|
| TC01 | UAV Selection | Multiple UAVs are available for a rescue mission. | The system selects a suitable available UAV. |
| TC02 | UAV Selection | A UAV has insufficient battery for the assigned mission. | The unsuitable UAV is excluded from selection. |
| TC03 | UAV Selection | A UAV is already assigned to another mission. | The unavailable UAV is not selected again. |
| TC04 | UAV Selection | Multiple UAVs have different distances from the mission location. | The system evaluates location while selecting a suitable UAV. |
| TC05 | Auto-Allocation | A rescue mission is added to the system. | An eligible UAV is automatically assigned. |
| TC06 | Auto-Allocation | Multiple rescue missions have different priorities. | Higher-priority missions are considered according to the allocation policy. |
| TC07 | Auto-Allocation | No suitable UAV is available. | The mission remains unassigned and the system reports the situation. |
| TC08 | Dynamic Events | An assigned UAV experiences a simulated failure. | The system marks the UAV unavailable and considers reassignment. |
| TC09 | Dynamic Events | A route becomes blocked during mission execution. | The system handles the route change and considers an alternative route or reassignment. |
| TC10 | Dynamic Events | A UAV becomes unavailable during allocation. | The system updates UAV status and prevents further assignment to it. |
| TC11 | Dynamic Events | A mission's priority changes. | The system updates the mission information and allocation decisions accordingly. |
| TC12 | Menu | The user selects the UAV display option. | The system displays the available UAV information. |
| TC13 | Menu | The user selects the automatic allocation option. | The allocation operation is initiated. |
| TC14 | Menu | The user selects a dynamic event simulation option. | The corresponding event-handling operation is initiated. |
| TC15 | Menu | The user selects the exit option. | The program terminates normally. |
| TC16 | Menu | The user enters an invalid menu choice. | The system displays an appropriate error message and allows another selection. |

## 3. Testing Categories

### A. Functional Testing
Verifies whether each Coordinator operation performs its intended function.

### B. Boundary Testing
Checks situations such as zero available UAVs, insufficient battery, and unavailable drones.

### C. Integration Testing
Checks the interaction between UAV selection, mission allocation, and dynamic event handling.

### D. Input Validation Testing
Checks how the menu handles invalid or unexpected user inputs.

## 4. Expected Testing Outcome

The Coordinator Module should:

- Select suitable UAVs based on mission requirements.
- Allocate missions while considering priority and UAV availability.
- Handle simulated failures and changing mission conditions.
- Update UAV and mission statuses correctly.
- Provide reliable menu-driven interaction.

## 5. Conclusion

These test cases provide a structured approach to evaluating the Coordinator Module. They cover normal operations, exceptional situations, and interactions between different system components.

**Note:** These are proposed test cases. Actual execution results should be recorded after running the corresponding system operations.
