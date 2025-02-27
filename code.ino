#include <Servo.h> // Include the Servo library

// Pin assignments for RC channels
const int channelPins[] = {2, 3, 4, 5}; // Channel 1-4 inputs
const int numChannels = 4;              // Number of channels
unsigned long channelValues[numChannels]; // Store channel values

// Initialize Servo/Thruster variables
Servo pump;
Servo servo1;
Servo esc; 

void setup() {
  Serial.begin(9600); // Start serial communication

  // Configure pins as inputs
  for (int i = 0; i < numChannels; i++) {
    pinMode(channelPins[i], INPUT);
  }

  // Attach servo and ESC
  pump.attach(11); // Pump on pin 11
  servo1.attach(12); // Servo Rudder on pin 12
  esc.attach(13);    // ESC Thruster on pin 13

  // Neutral signal for ESC to initialize
  esc.writeMicroseconds(1500); 
  delay(5000); // Allow ESC to initialize

  Serial.println("Reading RC Channel Values and Controlling Servos + Thruster:");
}

void loop() {
  // Read pulse widths and store in array
  for (int i = 0; i < numChannels; i++) {
    channelValues[i] = pulseIn(channelPins[i], HIGH);
  }

  // Map RC values (1000-2000 µs) to servo angles (0-180 degrees) and ESC PWM
  int pumpAngle = map(channelValues[2], 1000, 2000, 0, 180);  // Servo "Rudder" control
  int servo1Angle = map(channelValues[0], 1000, 2000, 0, 180);  // Servo "Rudder" control
  int escSignal = map(channelValues[1], 2000, 1000, 1575, 1425); // Thruster control (with restricted range to avoid overpowering)
  
  // Constrain values to the desired range
  pumpAngle = constrain(pumpAngle, 0, 180);
  servo1Angle = constrain(servo1Angle, 0, 180);
  escSignal = constrain(escSignal, 1000, 2000);

  // Move servo and ESC to the calculated positions
  pump.write(pumpAngle);
  servo1.write(servo1Angle);
  esc.writeMicroseconds(escSignal);

  // Print channel values and outputs
  for (int i = 0; i < numChannels; i++) {
    Serial.print("Ch ");
    Serial.print(i + 1);
    Serial.print(": ");
    Serial.print(channelValues[i]);
    Serial.print(" us");
    if (i < numChannels - 1) Serial.print(" | ");
  }
  Serial.print(" | Pump Signal: ");
  Serial.print(pumpAngle);
  Serial.print(" | Servo Angle: ");
  Serial.print(servo1Angle);
  Serial.print(" | Thruster Signal: ");
  Serial.println(escSignal);

  delay(100); // Small delay for readability
}
