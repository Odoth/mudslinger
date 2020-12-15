# Scripting API #

All scripts have access to the following scripting API functions:

+ **print(text)** - Print the text to the output window. No return value.

+ **send(text)** - Send the text to the game. No return value.

All scripts also share the same `this` object, allowing information to be shared between scripts or between calls of the same script. See Examples section.


# Alias Scripts #

## Non-regex Alias Scripts ##
Non-regex alias scripts have the following script arguments:

+ **input** - The full command that was input.

## Regex Alias Scripts ##
Regex alias scripts have the following script arguments:

+ **input** - The full command that was input.

+ **match** - The regex match array.


# Trigger Scripts #

## Non-regex Trigger Scripts ##
Non-regex trigger scripts have the following script arguments:

+ **line** - The full line that the trigger matched on.

## Regex Trigger Scripts ##
Regex trigger scripts have the following script arguments:

+ **line** - The full line that the trigger matched on.

+ **match** - The regex match array.

# Examples #

## Kill 10 orcs then stop
Trigger pattern (non-regex): An orc is DEAD!!

Trigger value (script):
```
#!javascript
this.deadOrcs = this.deadOrcs || 0;
this.deadOrcs++;

print("deadOrcs: " + this.deadOrcs);

if (this.deadOrcs < 10) {
  send("kill orc");
} else {
  send("say Already killed 10 orcs.");
}
```
