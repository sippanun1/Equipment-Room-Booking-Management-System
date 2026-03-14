interface Room {
  id: string
  name: string
  image: string
  badge: string
  badgeColor: string
  availability: string
  capacity: string
  status: string
  usageDays?: Record<string, boolean>
  timeRanges?: Record<string, { start: string; end: string }>
}

interface ListPopularRoomProps {
  rooms: Room[]
  onBookNow?: (room: Room) => void
}

export default function ListPopularRoom({ rooms, onBookNow }: ListPopularRoomProps) {
  const getStatusButtonColor = (availability: string) => {
    if (availability === "Available") {
      return "#228B22" // Green for available
    } else if (availability === "Full") {
      return "#8B0000" // Dark red for full
    }
    return "#FF7F50" // Orange as default
  }

  return (
    <div className="bg-[#FFDAB9] w-full px-4 py-6">
      {/* POPULAR ROOMS Title */}
      <div className="w-full mb-6">
        <h3 className="text-base font-semibold" style={{ color: '#FF7F50' }}>
          POPULAR ROOMS
        </h3>
      </div>

      {/* Room Cards Grid */}
      <div className="w-full grid grid-cols-2 gap-4 mb-6">
        {rooms.map((room) => (
          <div
            key={room.id}
            className="rounded-lg overflow-hidden hover:shadow-lg transition bg-white"
          >
            {/* Room Image */}
            <div className="relative h-32 bg-gray-300 flex items-center justify-center overflow-hidden">
              {room.image && room.image.startsWith('data:image') ? (
                <img src={room.image} alt={room.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-4xl">{room.image || '🏢'}</span>
              )}
              {/* Badge */}
              <div className={`absolute top-2 left-2 ${room.badgeColor} text-white text-xs font-bold px-2 py-1 rounded`}>
                {room.badge}
              </div>
            </div>

            {/* Room Info */}
            <div className="p-3">
              {/* Room Name */}
              <h4 className="font-semibold text-sm mb-2" style={{ color: '#595959' }}>
                {room.name}
              </h4>

              {/* Availability Status */}
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="text-white text-xs font-bold px-2 py-1 rounded-full"
                  style={{ backgroundColor: getStatusButtonColor(room.availability) }}
                >
                  {room.availability}
                </div>
              </div>

              {/* Capacity/Info
                <p className="text-xs mb-3" style={{ color: '#595959' }}>
                    {room.capacity}
                </p> 
              */}

              {/* Book Now Button */}
              <button
                onClick={() => onBookNow?.(room)}
                className="
                  w-full
                  py-2
                  rounded-full
                  text-white
                  text-xs font-medium
                  transition
                  hover:opacity-90
                "
                style={{ backgroundColor: '#FF7F50' }}
              >
                {room.status}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
