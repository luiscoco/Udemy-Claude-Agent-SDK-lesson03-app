"""Control fixture for offline tests; never copied into a real agent run."""
def calculate_average(numbers):
    return sum(numbers) / len(numbers) if numbers else 0


def get_user_name(user):
    return user["name"].upper() if user else ""
