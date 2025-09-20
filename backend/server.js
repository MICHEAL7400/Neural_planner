const express = require("express");
const cors = require("cors");
const pool = require("./db");
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));
app.use(express.json());

// Test endpoint
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend is working! 🚀" });
});

// Get all tasks
app.get("/api/tasks", async (req, res) => {
  try {
    console.log("Fetching tasks...");
    const [tasks] = await pool.execute("SELECT * FROM tasks ORDER BY created_at DESC");
    res.json(tasks);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add a new task
app.post("/api/tasks", async (req, res) => {
  try {
    console.log("Adding task:", req.body);
    const { title, deadline, priority, estimatedHours, type, energyLevel } = req.body;
    
    if (!title || !deadline) {
      return res.status(400).json({ error: "Title and deadline are required" });
    }

    const [result] = await pool.execute(
      "INSERT INTO tasks (title, deadline, priority, estimated_hours, type, energy_level) VALUES (?, ?, ?, ?, ?, ?)",
      [title, deadline, priority, estimatedHours, type, energyLevel]
    );

    const [newTask] = await pool.execute("SELECT * FROM tasks WHERE id = ?", [result.insertId]);
    res.status(201).json(newTask[0]);
  } catch (error) {
    console.error("Error adding task:", error);
    res.status(500).json({ error: error.message });
  }
});

// Update a task
app.put("/api/tasks/:id", async (req, res) => {
  try {
    const taskId = req.params.id;
    const { title, deadline, priority, estimated_hours, energy_level, completed } = req.body;
    
    const [result] = await pool.execute(
      "UPDATE tasks SET title = ?, deadline = ?, priority = ?, estimated_hours = ?, energy_level = ?, completed = ? WHERE id = ?",
      [title, deadline, priority, estimated_hours, energy_level, completed, taskId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    const [updatedTask] = await pool.execute("SELECT * FROM tasks WHERE id = ?", [taskId]);
    res.json(updatedTask[0]);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a task
app.delete("/api/tasks/:id", async (req, res) => {
  try {
    const taskId = req.params.id;
    
    const [result] = await pool.execute("DELETE FROM tasks WHERE id = ?", [taskId]);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ message: "Task deleted successfully" });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mark task as completed
app.patch("/api/tasks/:id/complete", async (req, res) => {
  try {
    const taskId = req.params.id;
    
    const [result] = await pool.execute(
      "UPDATE tasks SET completed = TRUE WHERE id = ?",
      [taskId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json({ message: "Task marked as completed" });
  } catch (error) {
    console.error("Error completing task:", error);
    res.status(500).json({ error: error.message });
  }
});

// Generate smart schedule
app.post("/api/generate-schedule", async (req, res) => {
  try {
    console.log("Generating schedule with:", req.body);
    const { availableSlots, powerSchedule } = req.body;
    
    // Get all incomplete tasks
    const [tasks] = await pool.execute("SELECT * FROM tasks WHERE completed = FALSE ORDER BY priority DESC, deadline ASC");
    
    const scheduledTasks = smartScheduler(tasks, availableSlots, powerSchedule);
    res.json(scheduledTasks);
  } catch (error) {
    console.error("Error generating schedule:", error);
    res.status(500).json({ error: error.message });
  }
});

// Weather endpoint
app.get("/api/weather", async (req, res) => {
  try {
    const { city = "Lusaka" } = req.query;
    const apiKey = process.env.WEATHER_API_KEY;
    
    if (!apiKey) {
      return res.status(400).json({ error: "Weather API key not configured" });
    }

    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`
    );

    const weatherData = {
      temperature: response.data.main.temp,
      description: response.data.weather[0].description,
      icon: response.data.weather[0].icon,
      humidity: response.data.main.humidity,
      windSpeed: response.data.wind.speed,
      city: response.data.name
    };

    res.json(weatherData);
  } catch (error) {
    console.error("Weather API error:", error.message);
    // Return mock data if API fails
    res.json({
      temperature: 25,
      description: "partly cloudy",
      icon: "02d",
      humidity: 65,
      windSpeed: 3.5,
      city: city
    });
  }
});

// Weather-aware scheduling suggestion
app.get("/api/weather-suggestion", async (req, res) => {
  try {
    const { city = "Lusaka" } = req.query;
    const weatherResponse = await axios.get(`http://localhost:5000/api/weather?city=${city}`);
    const weather = weatherResponse.data;
    
    let suggestion = "";
    
    if (weather.temperature > 30) {
      suggestion = "Hot day! Schedule intense tasks for cooler morning/evening hours.";
    } else if (weather.temperature < 15) {
      suggestion = "Chilly weather. Good for focused indoor tasks.";
    } else if (weather.description.includes("rain")) {
      suggestion = "Rainy day. Perfect for indoor coding and study sessions!";
    } else if (weather.description.includes("cloud")) {
      suggestion = "Cloudy weather. Balanced energy for all types of tasks.";
    } else {
      suggestion = "Beautiful weather! Great for any activities.";
    }
    
    res.json({ weather, suggestion });
  } catch (error) {
    res.status(500).json({ error: "Failed to get weather suggestions" });
  }
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Smart scheduling algorithm
function smartScheduler(tasks, availableSlots, powerSchedule) {
  if (!tasks || tasks.length === 0) {
    return [];
  }

  // Sort tasks by priority (High first) and then by deadline (Earliest first)
  tasks.sort((a, b) => {
    const priorityValues = { High: 3, Medium: 2, Low: 1 };
    const priorityDiff = priorityValues[b.priority] - priorityValues[a.priority];
    
    if (priorityDiff !== 0) return priorityDiff;
    
    return new Date(a.deadline) - new Date(b.deadline);
  });

  const scheduledTasks = [];
  const availableCopy = JSON.parse(JSON.stringify(availableSlots));

  // Convert available slots to a more usable format
  const timeSlotsByDay = {};
  for (const day in availableCopy) {
    timeSlotsByDay[day] = availableCopy[day].map(slot => {
      const [start, end] = slot.split('-');
      return {
        start: parseInt(start.replace(':', '')),
        end: parseInt(end.replace(':', '')),
        original: slot
      };
    });
  }

  // Schedule each task
  for (const task of tasks) {
    if (task.completed) continue;

    const taskHours = parseFloat(task.estimated_hours) || 2;
    const optimalSlot = findOptimalTimeSlot(timeSlotsByDay, powerSchedule, task, taskHours);

    if (optimalSlot) {
      scheduledTasks.push({
        task: task.title,
        scheduled: optimalSlot.timeString,
        day: optimalSlot.day,
        startTime: optimalSlot.start,
        endTime: optimalSlot.end,
        deadline: task.deadline,
        priority: task.priority,
        energyRequired: task.energy_level,
        duration: taskHours
      });

      // Remove the used time from available slots
      removeTimeFromSlot(timeSlotsByDay, optimalSlot.day, optimalSlot.originalSlot, optimalSlot.start, optimalSlot.end, taskHours);
    }
  }

  return scheduledTasks;
}

// Find optimal time slot considering energy levels and power availability
function findOptimalTimeSlot(timeSlotsByDay, powerSchedule, task, taskHours) {
  const energyLevel = task.energy_level || 'medium';
  
  // Check each day
  for (const day in timeSlotsByDay) {
    for (const slot of timeSlotsByDay[day]) {
      const slotDuration = (slot.end - slot.start) / 100;
      
      // Check if slot has enough time
      if (slotDuration >= taskHours) {
        // Check power availability
        if (isPowerAvailable(powerSchedule[day], slot.start, slot.end)) {
          // Check energy compatibility
          if (isEnergyCompatible(slot.start, energyLevel)) {
            return {
              day,
              start: slot.start,
              end: slot.start + Math.floor(taskHours * 100),
              timeString: `${day} ${formatTime(slot.start)}-${formatTime(slot.start + Math.floor(taskHours * 100))}`,
              originalSlot: slot.original
            };
          }
        }
      }
    }
  }
  
  // If no perfect match found, try any available slot
  for (const day in timeSlotsByDay) {
    for (const slot of timeSlotsByDay[day]) {
      const slotDuration = (slot.end - slot.start) / 100;
      
      if (slotDuration >= taskHours && isPowerAvailable(powerSchedule[day], slot.start, slot.end)) {
        return {
          day,
          start: slot.start,
          end: slot.start + Math.floor(taskHours * 100),
          timeString: `${day} ${formatTime(slot.start)}-${formatTime(slot.start + Math.floor(taskHours * 100))}`,
          originalSlot: slot.original
        };
      }
    }
  }
  
  return null;
}

// Helper function to format time (800 -> "08:00", 1430 -> "14:30")
function formatTime(timeInt) {
  const hours = Math.floor(timeInt / 100).toString().padStart(2, '0');
  const minutes = (timeInt % 100).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Remove used time from available slot
function removeTimeFromSlot(timeSlotsByDay, day, originalSlot, startTime, endTime, taskHours) {
  const daySlots = timeSlotsByDay[day];
  const slotIndex = daySlots.findIndex(slot => slot.original === originalSlot);
  
  if (slotIndex !== -1) {
    const slot = daySlots[slotIndex];
    const remainingTimeBefore = startTime - slot.start;
    const remainingTimeAfter = slot.end - endTime;
    
    // Remove the original slot
    daySlots.splice(slotIndex, 1);
    
    // Add remaining time before the scheduled task
    if (remainingTimeBefore >= 100) { // At least 1 hour remaining
      daySlots.push({
        start: slot.start,
        end: startTime,
        original: `${formatTime(slot.start)}-${formatTime(startTime)}`
      });
    }
    
    // Add remaining time after the scheduled task
    if (remainingTimeAfter >= 100) { // At least 1 hour remaining
      daySlots.push({
        start: endTime,
        end: slot.end,
        original: `${formatTime(endTime)}-${formatTime(slot.end)}`
      });
    }
    
    // Re-sort the slots
    daySlots.sort((a, b) => a.start - b.start);
  }
}

// Check power availability for given time slot
function isPowerAvailable(dayPowerSchedule, startTime, endTime) {
  if (!dayPowerSchedule || dayPowerSchedule.length === 0) return true;
  
  for (const powerSlot of dayPowerSchedule) {
    const [powerStart, powerEnd] = powerSlot.split('-').map(time => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 100 + (minutes || 0);
    });
    
    if (startTime >= powerStart && endTime <= powerEnd) {
      return true;
    }
  }
  return false;
}

// Check if time slot matches energy requirements
function isEnergyCompatible(startTime, energyLevel) {
  // High energy tasks work best in morning (8-12) or evening (18-20)
  if (energyLevel === "high") {
    return (startTime >= 800 && startTime < 1200) || (startTime >= 1800 && startTime < 2000);
  }
  
  // Medium energy tasks work in moderate hours (12-18)
  if (energyLevel === "medium") {
    return (startTime >= 1200 && startTime < 1800);
  }
  
  // Low energy tasks can be done anytime
  return true;
}

app.listen(PORT, () => {
  console.log(`🧠 Neural Planner backend running on http://localhost:${PORT}`);
});