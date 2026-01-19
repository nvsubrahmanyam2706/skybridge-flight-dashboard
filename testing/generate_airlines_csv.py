import csv

input_file = "airlines.dat"
output_file = "airlines.csv"

airlines = []

with open(input_file, encoding="utf-8") as f:
    for line in f:
        parts = line.strip().split(",")
        if len(parts) < 7:
            continue

        name = parts[1].strip('"')
        iata = parts[3].strip('"')
        icao = parts[4].strip('"')

        # only keep real airlines with valid codes
        if iata and iata != "\\N" and icao and icao != "\\N":
            airlines.append((icao, iata, name))

# remove duplicates
unique = {}
for icao, iata, name in airlines:
    unique[icao] = (iata, name)

with open(output_file, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["icao", "iata", "name"])
    for icao, (iata, name) in sorted(unique.items()):
        writer.writerow([icao, iata, name])

print(f"Generated airlines.csv with {len(unique)} airlines")
